var Q = require('q');
var tt = require('./tinytemper');
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
// Comamnd used by the procedure.
var Commands = {
    'CurrentCommit':            "git log --pretty=format:'%h' -n 1",
    'ListUpdatesSinceCommit':   "git diff --name-status {ref} {current}",
    'ZipFilesInCommit':         "git archive -o {zip} {ref} {files}",
    'ListFilesInCommit':        "git show --pretty='format:' --name-only {commit}",
    'AddFileToZip':             "zip {zip} -j {file}",
    'MakeDir':                  "mkdir -p {dir}"
};
var Log = require('log4js').getLogger('git-pms');

/**
 * Test whether a file or directory exists.
 */
function exists( path, isDir ) {
    return Q.nfcall( fs.stat, path )
    .then(function( stats ) {
        return true && (!isDir || stats.isDirectory());
    })
    .fail(function() {
        return false;
    });
}

/**
 * Execute a named command with the specified arguments.
 * The command name must appear in Commands above. Arguments must
 * be named according to the command template.
 * Returns a promise resolving to the command's stdout. The stdout
 * is parsed into an array of output lines.
 */
function exec( cwd, name, args ) {
    var dp = Q.defer();
    try {
        var cmdline = tt.eval( Commands[name], args||{} );
        Log.debug('%s> %s', cwd, cmdline );
        cmdline = cmdline.split(' ');
        var cmd = cmdline[0], args = cmdline.slice( 1 );
        var stdout = [], stderr = [];
        var proc = spawn( cmd, args, { cwd: cwd });
        proc.stdout.on('data', function( data ) {
            stdout.push( data );
        });
        proc.stderr.on('data', function( data ) {
            stderr.push( data );
        });
        proc.on('error', function( e ) {
            dp.reject( e );
        });
        proc.on('close', function() {
            if( stderr.length > 0 ) {
                stderr = Buffer.concat( stderr ).toString();
                Log.debug('stderr:', stderr );
                dp.reject( stderr );
            }
            else {
                stdout = Buffer.concat( stdout ).toString();
                Log.debug('stdout:', stdout );
                dp.resolve( stdout.split('\\n') );
            }
        });
    }
    catch( e ) {
        Log.error('exec', e );
        dp.reject();
    }
    return dp.promise;
}

/**
 * Return the hash of the current (latest) commit in the specified repo directory.
 */
function current( repoDir ) {
    return exec( repoDir, 'CurrentCommit');
}

/**
 * Create a zip file containing the complete contents of the current commit of
 * a git repo.
 */
function packageCurrent( repoDir, packageDir ) {
    var args = {};
    // Start by checking that the repo dir exists.
    return exists( repoDir, true )
    .then(function( repoExists ) {
        if( !repoExists ) {
            throw new Error('REPO_NOT_FOUND');
        }
        // Continue by getting the hash of the latest commit.
        return exec( repoDir, 'CurrentCommit');
    })
    .then(function( current ) {
        args.current = current;
        args.packageDir = path.join( packageDir, current );
        args.zip = tt.eval('{packageDir}/content.zip', args );
        // Check if a zip file for the current and reference commits
        // has already been created.
        return exists( args.zip );
    })
    .then(function( exists ) {
        if( exists ) {
            // Zip file exists, return path.
            return Q( args );
        }
        // Make an output directory for the zip file.
        return exec( repoDir, 'MakeDir', { dir: args.packageDir })
        .then(function() {
            // Create a zip file containing all content files.
            return exec( repoDir, 'ZipFilesInCommit', args );
        })
        .then(function() {
            // Generate the manifest file.
            var manifest = {
                commit: args.current
            };
            var filename = tt.eval('{packageDir}/.semo-manifest', args );
            return Q.nfcall( fs.writeFile, filename, JSON.stringify( manifest ) )
            .then(function() {
                // Add the manifest file to the zip archive.
                return exec( repoDir, 'AddFileToZip', { zip: args.zip, file: filename });
            });
        })
        .then(function() {
            // Return path to zip file as result.
            return Q( args );
        });
    });
}

/**
 * Create a zip file containing all updates since a reference commit in a git
 * repo.
 * Returns a promise resolving to the filename of the zip file.
 */
function packageUpdatesSince( ref, repoDir, packageDir ) {
    var args = {
        ref: ref
    };
    // Start by getting the hash of the latest commit.
    return exec( repoDir, 'CurrentCommit')
    .then(function( current ) {
        args.current = current;
        args.packageDir = path.join( packageDir, current, ref );
        args.zip = tt.eval('{packageDir}/content.zip', args );
        // Check if a zip file for the current and reference commits
        // has already been created.
        return Q.nfcall( fs.stat, args.zip )
        .then(function() {
            return true;
        })
        .fail(function() {
            return false;
        });
    })
    .then(function( exists ) {
        if( exists ) {
            // Zip file exists, return path.
            return Q( args );
        }
        // Get a list of files updated since the reference commit.
        // Note that this won't contain information on all deletes.
        return exec( repoDir, 'ListUpdatesSinceCommit', args )
        .then(function( files ) {
            args.files = files;
            // Make an output directory for the zip file.
            return exec( repoDir, 'MakeDir', { dir: args.packageDir })
            .then(function() {
                // Create a zip file containing all the updated files.
                return exec( repoDir, 'ZipFilesInCommit', args );
            });
        })
        .then(function() {
            // List all files in the reference commit. This is the
            // first step to detect all files deleted since the
            // reference commit.
            return exec( repoDir, 'ListFilesInCommit', { commit: ref });
        })
        .then(function( files ) {
            // Create an object for quick lookup of the files in the
            // reference commit.
            var fileset = files.reduce(function( result, file ) {
                result[file] = true;
            }, {});
            return Q( fileset );
        })
        .then(function( fileset ) {
            // List all files in the current commit...
            return exec( repoDir, 'ListFilesInCommit', { commit: args.current })
            .then(function( currFiles ) {
                // ...then delete all matching file names from the
                // reference set.
                files.forEach(function( file ) {
                    delete fileset[file];
                });
                // What is left in fileset are the files in the reference
                // commit which aren't in the current commit - i.e.
                // the files deleted since the reference commit.
                return Object.keys( fileset );
            });
        })
        .then(function( deletes ) {
            // Generate the manifest file.
            var manifest = {
                commit:     args.current,
                deletes:    deletes
            };
            var filename = tt.eval('{packageDir}/.semo-manifest', args );
            return Q.nfcall( fs.writeFile, filename, JSON.stringify( manifest ) )
            .then(function() {
                // Add the manifest file to the zip archive.
                return exec( repoDir, 'AddFileToZip', { zip: args.zip, file: filename });
            });
        })
        .then(function() {
            // Return path to zip file as result.
            return Q( args );
        });
    });
}
exports.current = current;
exports.packageCurrent = packageCurrent;
exports.packageUpdatesSince = packageUpdatesSince;
