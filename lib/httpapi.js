var Log = require('log4js').getLogger('httpapi');
var Q = require('q');
var mods = {
    fs:     require('fs'),
    gitpms: require('./git-pms'),
    http:   require('http'),
    path:   require('path')
}

var JsonContentHeaders = {
    'Pragma':           'no-cache',
    'Cache-Control':    'no-cache',
    'Expires':          '0',
    'Content-Type':     'application/json'
};

/**
 * Send a JSON document over HTTP.
 * @param res       A HTTP response object.
 * @param data      The data to send as JSON.
 * @param status    The HTTP response status code.
 */
function sendJSON( res, data, status ) {
    res.writeHead( status||200, JsonContentHeaders );
	res.end( JSON.stringify( data ) );
}

// Return the public URL for a content zip file.
function makeZipURL( settings, zipPath ) {
    zipPath = mods.path.relative( settings.packageDir, zipPath );
    return settings.zipBaseURL+zipPath;
}

// Send a client response indicating no available content update.
function noUpdateResponse( settings, res, feed ) {
    sendJSON( res, {
        feed:       feed,
        status:     'no-update'
    });
}

// Send a client response referencing content updated since a previous, non-current build.
function updateSinceResponse( settings, res, feed, since, result ) {
    var url = makeZipURL( zipPath, settings );
    sendJSON( res, {
        status:     'update-since',
        feed:       feed,
        since:      since,
        current:    result.current,
        url:        url
    });
}

// Send a client response referencing the current build.
function currentContentResponse( settings, res, feed, result ) {
    var url = makeZipURL( zipPath, settings );
    sendJSON( res, {
        feed:       feed,
        status:     'current-content',
        current:    result.current,
        url:        url
    });
}

// Send a client response indicating that no content is available.
function noContentAvailableResponse( settigs, res, feed ) {
    sendJSON( res, {
        feed:       feed,
        status:     'no-content-available'
    });
}

// Send an error response to the client.
function errorResponse( settigs, res, err ) {
    Log.error( err.cause||err );
    sendJSON( res, {
        status:     'error',
        message:    'Internal server error'
    }, 500 );
}

/**
 * Start the publisher service.
 * Settings:
 * - repoDir:       The directory under which git repos are placed.
 * - packageDir:    The directory under which content zips are generated and stored.
 * - zipBaseURL:    The URL under which package zips are published.
 * - port:          The port the HTTP service listens on.
 * 
 */
function start( settings ) {
    var uspace = mods.uspace.Service();
    uspace.map({
        // The publisher provides a single URL that accepts the following parameters:
        // @feed:   A feed ID.
        // @since:  A previous build commit hash (optional). If present, then the publisher will
        //          attempt to return only the differences between that and the current commit.
        '/': function( req, res ) {
            // TODO NOTE: Whenever the app downloads a complete content update - i.e. because it doesn't
            // submit a since; or when the since commit hash isn't recognized (isn't part of the commit
            // history) then it should *completely delete the local subs dir* before unpacking the update;
            // this is to ensure that e.g. in the case of a feed reset, the app doesn't accumulate
            // out of date or obsolete files.
            var since = req.param('since');
            Q(function() {
                var feed = req.param('feed');
                if( !feed ) {
                    sendJSON( res, {
                        status:     'error',
                        message:    'Missing "feed" parameter'
                    }, 400 );
                }
                else if( !since ) {
                    mod.gitpms.packageCurrent( settings.repoDir, settings.packageDir )
                    .then(function( result ) {
                        currentContentResponse( settings, res, feed, result );
                    });
                }
                // Get the current commit hash.
                else mods.gitpms.current( settings.repoDir )
                .then(function( hash ) {
                    if( !hash ) {
                        noContentAvailableResponse( settings, res, feed );
                    }
                    else if( since == hash ) {
                        noUpdateResponse( settings, res, feed );
                    }
                    else mods.gitpms.packageUpdatesSince( since, settings.repoDir, settings.packageDir )
                    .then(function( result ) {
                        updateSinceResponse( settings, res, feed, since, result );
                    });
                })
                done();
            })
            .fail(function( err ) {
                // Try returning a complete copy of the current content.
                mod.gitpms.packageCurrent( settings.repoDir, settings.packageDir )
                .then(function( result ) {
                    currentContentResponse( settings, res, feed, result );
                })
                .fail(function( err ) {
                    errorResponse( settings, res, err );
                });
            });
        }
    });
    // Ensure that the base URL ends with a slash.
    if( !/\/$/.test( settings.zipBaseURL ) ) {
        settings.zipBaseURL += '/';
    }

    var port = settings.port||8080;
    Log.info('Listening on port %d...', port);
    this.uspace = uspace.start( port );
}

exports.start = start;
