var Log = require('log4js').getLogger('http');
var Q = require('q');
var mods = {
    fs:     require('fs'),
    gitpms: require('./gitpms'),
    http:   require('http'),
    path:   require('path'),
    uspace: require('./uspace')
}
var format = require('util').format;

var ApiVersion = '2.0';

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

// Return the path to a repo in the file system
// At the moment use: server/feed
// e.g. reposDir/github.com/jloriente/innerfunction/
// We avoid the username for now
function resolveRepoFilePath( dir, server, feed ){
    return mods.path.join( dir, server, feed );
}

// /packages/github.com/jloriente/innerfunction
function resolveRepoDirPath( packageDir, server, feed ){
    return mods.path.join( packageDir, server, feed );
}

// Return the public URL for a content zip file.
function makeZipURL( settings, outputFeedFile ) {
    outputFeedFile = mods.path.relative( settings.packageDir, outputFeedFile );
    return settings.zipBaseURL+outputFeedFile;
}

// Clone response
function cloneResponse( settings, server, res, user, feed ) {
    sendJSON( res, {
        user:       user,
        server:     server,
        feed:       feed,
        status:     'cloned'
    });
}

// Send a client response indicating no available content update.
function noUpdateResponse( settings, res, feed ) {
    sendJSON( res, {
        feed:       feed,
        status:     'no-update'
    });
}

// Send a client response paerencing content updated since a previous, non-current build.
function updateSinceResponse( settings, res, feed, since, result ) {
    var url = makeZipURL( settings, result.outputFeedFile );
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
    var url = makeZipURL( settings, result.outputFeedFile );
    sendJSON( res, {
        feed:       feed,
        status:     'current-content',
        current:    result.current,
        url:        url
    });
}

// Send a client response indicating that no content is available.
function noContentAvailableResponse( settings, res, feed ) {
    sendJSON( res, {
        feed:       feed,
        status:     'no-content-available'
    });
}

// Send an error response to the client.
function errorResponse( tag, settings, res, err ) {
    if ( err.message ){
        switch ( err.message ){
            case 'REPO_NOT_FOUND':
                sendJSON( res, {
                    status:     'error',
                    message:    'Repo not found'
                }, 404 );
            break;
            case 'REPO_ALREADY_EXIST':
                sendJSON( res, {
                    status:     'error',
                    message:    format('Not cloned. Repo already exist')
                }, 400 );
            break;
            case 'GIT_ERROR':
                sendJSON( res, {
                    status:     'error',
                    message:    format('Not cloned. Error ')
                }, 400 );
            break;
            default:
                sendJSON( res, {
                    status:     'error',
                    message:    err.message
                }, 400 );
            break;
        }
    }
    else {
        Log.error('%s:', tag, err.cause||err.message||err );
        sendJSON( res, {
            status:     'error',
            message:    'Internal server error'
        }, 500 );
    }
}

// Return the current content.
function returnCurrentContent( repoDir, packageDir, settings, res, feed ) {
    return mods.gitpms.packageCurrent( repoDir, packageDir )
    .then(function( result ) {
        currentContentResponse( settings, res, feed, result );
    })
    .fail(function( err ) {
        errorResponse('-> packageCurrent', settings, res, err );
    });
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
    var uspace = new mods.uspace.Service();
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
            Q.fcall(function() {
                var server = req.param('server') || 'github.io';
                // Check the API version number.
                var apiVer = req.param('apiver');
                if( apiVer != ApiVersion ) {
                    sendJSON( res, {
                        status:     'error',
                        message:    format('Unsupported or missing API version parameter: %s', apiVer )
                    }, 400 );
                    return Q();
                }
                var feed = req.param('feed');
                if( !feed ) {
                    sendJSON( res, {
                        status:     'error',
                        message:    'Missing feed parameter'
                    }, 400 );
                    return Q();
                }
                var since = req.param('since');
                var repoDir = resolveRepoFilePath( settings.repoDir, server, feed );
                var packageDir = resolveRepoDirPath( settings.packageDir, server, feed );
                Log.debug('/ feed=%s since=%s repoDir=%s packageDir=%s', feed, since, repoDir, packageDir );
                if( !since ) {
                    return returnCurrentContent( repoDir, packageDir, settings, res, feed );
                }
                // Get the current commit hash.
                else {
                    return mods.gitpms.current( repoDir )
                    .then(function( hash ) {
                        if( !hash ) {
                            noContentAvailableResponse( settings, res, feed );
                        }
                        else if( since == hash ) {
                            noUpdateResponse( settings, res, feed );
                        }
                        else mods.gitpms.packageUpdatesSince( since, repoDir, packageDir )
                        .then(function( result ) {
                            updateSinceResponse( settings, res, feed, since, result );
                        })
                        .fail(function( err ) {
                            Log.warn( err.message||err );
                            if( /fatal: ambiguous argument/.test( err ) ) {
                                // This will occur if the specified commit hash isn't recognized.
                                // Just return the current content.
                                returnCurrentContent( repoDir, packageDir, settings, res, feed );
                            }
                            if( /fatal: Not a valid object name/.test( err ) ) {
                                // This will occur if the specified commit folder outpt-json is not in commit
                                returnCurrentContent( repoDir, packageDir, settings, res, feed );
                            }
                            else errorResponse('-> packageUpdatesSince', settings, res, err );
                        });
                    })
                    .fail(function( err ) {
                        Log.warn('-> current');
                        // Try returning a complete copy of the current content.
                        returnCurrentContent( repoDir, packageDir, settings, res, feed );
                    });
                }
            })
            .fail(function( err ) {
                errorResponse('Handling /', settings, res, err );
            });
        },
        '/clone' : function(req, res){
          Q.fcall(function(){
              Log.debug('GET /clone Cloning site...');
              var server = req.param('server') || 'github.com';
              var username = req.param('username');
              if ( !username ){
                  sendJSON( res, {
                      status:     'error',
                      message:    format('Missing username parameter')
                  }, 400 );
                  return Q();
              }
              var password = req.param('password')
              if ( !password ){
                  sendJSON( res, {
                      status:     'error',
                      message:    format('Missing password parameter')
                  }, 400 );
                  return Q();
              }
              var feed = req.param('feed');
              if( !feed ) {
                  sendJSON( res, {
                      status:     'error',
                      message:    'Missing feed parameter'
                  }, 400 );
                  return Q();
              }
              var repoDir = resolveRepoFilePath( settings.repoDir, server, feed );
              mods.gitpms.clone( repoDir, server, username, password, feed )
              .then(function( result ){
                  Log.debug('Repo cloned: ' + repoDir);
                  cloneResponse( settings, server, res, username, feed );
              })
              .fail(function( err ){
                  Log.error("Error --> %s ", err.message);
                  errorResponse( ' this is the tag', settings, res, err )
              })
          })
          .fail(function( err ) {
              errorResponse('Handling /update', settings, res, err );
          });
        }
    });
    // Ensure that the base URL ends with a slash.
    if( !/\/$/.test( settings.zipBaseURL ) ) {
        settings.zipBaseURL += '/';
    }
    Log.debug('Settings:');
    for( var id in settings ) Log.debug('  %s:\t%j', id, settings[id] );

    var port = settings.port||8080;
    uspace.start( port );
}

exports.start = start;
