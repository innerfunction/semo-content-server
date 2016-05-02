var connect = require('connect');
var express = require('express');
var Log = require('log4js').getLogger('uspace');

/**
 * Instantiate a new URI Space service.
 */
Service = function() {
    this.maps = [];
}

/**
 * Add a set of path mappings to the service configuration.
 * @param paths An object mapping path template strings to handler definitions.
 */
Service.prototype.map = function( paths ) {
    if( this.server ) { // => service is running
        for( var path in paths ) {
            this.mapPath( path, paths[path], paths );
        }
    }
    else {              // => service isn't started
        this.maps.push( paths );
    }
}

/**
 * Rewrites a path mapping to apply a filter function to each path handler, returns the modified
 * path mappings.
 * @param filter    A function used to filter all requests. Should take 'request' and 'response'
 *                  arguments. Should return 'true' if the request should be passed to the handler
 *                  function.
 * @param paths     The set of path handler definitions.
 */
Service.prototype.apply = function( filter, paths ) {
    var fpaths = {};
    function applyFilter( handler ) {
        return function( req, res ) {
            filter( req, res ) && handler( req, res );
        };
    }
    for( var path in paths ) {
        var pathDef = paths[path];
        switch( typeof( pathDef ) ) {
        case 'function':
            fpaths[path] = applyFilter( pathDef );
            break;
        case 'object':
            var handlers = {};
            for( var method in pathDef ) {
                handlers[method] = applyFilter( pathDef[method] );
            }
            fpaths[path] = handlers;
            break;
        default:
            fpaths[path] = pathDef;
        }
    }
    return fpaths;
}

/**
 * Map a URI space path to its handler(s) on an Express server instance.
 * @param path      The path being mapped.
 * @param pathDef   The path handler definition. Can be a string, function or object:
 *                  - a string value indicates that the current path is an alias for another path.
 *                  - a function will be directly used to handle requests.
 *                  - an object value may have GET, PUT, POST, DEL and ANY (or '*') function properties.
 * @param paths     The object containing all path mappings (used for alias resolution).
 * @param _aliases  Used internally by the function when resolving aliased paths, to avoid circular references.
 */
Service.prototype.mapPath = function( path, pathDef, paths, _aliases ) {
    // Generate a request handler function.
    function handler( method, f1, f2 ) {
        var fn = typeof( f1 ) == 'function'
                    ? f1
                    : (typeof( f2 ) == 'function'
                        ? f2
                        : false);
        if( fn ) {
            Log.debug('-> %s %s', method, path );
            return function( req, res ) {
                Log.info('%s %s', method, path );
                return fn( req, res );
            };
        }
        return false;
    }
    // Examine the type of the path handler.
    switch( typeof( pathDef ) ) {
    case 'string':
        _aliases = _aliases||{}
        // The path is an alias for another mapped path.
        var def = paths[pathDef];
        if( typeof( def ) == 'string' && _aliases[def] ) {
            // Path aliases form a circular reference.
            Log.error('Alias for path %s forms a circular reference on %s', path, def );
        }
        else {
            _aliases[def] = true;
            Log.debug('Aliasing %s to %s', path, def );
            this.mapPath( path, def, paths, _aliases );
        }
        break;
    case 'function': 
        // The path is mapped to a GET handler.
        this.server.get( path, handler('GET', pathDef ) );
        break;
    case 'object':
        // The path is mapped to a set of HTTP method handlers.
        // Available handlers are GET, PUT, POST and DEL or DELETE.
        // ANY or * is used as a default handler if none exists for the specific method.
        var any = pathDef['ANY']||pathDef['*'];
        var get = handler('GET', pathDef['GET'], any );
        if( get ) {
            this.server.get( path, get );
        }
        var put = handler('PUT', pathDef['PUT'], any );
        if( put ) {
            this.server.put( path, put );
        }
        var post = handler('POST', pathDef['POST'], any );
        if( post ) {
            this.server.post( path, post );
        }
        var del = handler('DEL', pathDef['DELETE']||pathDef['DEL'], any );
        if( del ) {
            this.server.del( path, del );
        }
        break;
    default : 
        Log.debug('Not mapped: %s -> %s', path, typeof( pathDef ));
        break;
    }
}

/**
 * Start an instance of the URI space service. 
 * Creates a new Express server, configures it with the path mappings and starts the server.
 * @param port   The port number the service will listen on.
 * @param secret Secret used to secure Express sessions.
 * @return The newly running Express server instance.
 */
Service.prototype.start = function( port, sessionTimeout, sessionSecret ){
    var server = module.exports = express.createServer();

    server.configure('development', function() {
        server.use( connect.errorHandler({ dumpExceptions: true, showStack: true }) );
    });

    server.configure('production', function() {
        server.use( connect.errorHandler() ); 
    });

    server.configure( function() {
        server.use( express.bodyParser() );
        server.use( express.cookieParser() );
        server.use( express.session({
            secret: sessionSecret||'wHere to Be is forEver or was',
            store:  server.sessionStore
        }));
    });
    this.server = server;

    // Setup any pre-registered paths.
    for( var i = 0; i < this.maps.length; i++ ) {
        var paths = this.maps[i];
        for( var path in paths ) {
            this.mapPath( path, paths[path], paths );
        }
    }

    server.listen( port )
    Log.info('Listening on port %d', port );
    return server;
}
exports.Service = Service;
