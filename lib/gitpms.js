var Q = require('q');
var tt = require('./tinytemper');
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
// Comamnd used by the procedure.
var Commands = {
    'CurrentCommit':            "git log --pretty=format:%h -n 1",
    'ListUpdatesSinceCommit':   "git diff --name-status {ref} {current}",
    'ZipFilesInCommit':         "git archive -o {zipPath} {ref} {files}",
    'ListFilesInCommit':        "git show --pretty=format: --name-only {commit}",
    'AddFileToZip':             "zip {zipPath} -j {file}",
    'MakeDir':                  "mkdir -p {dir}"
};
var Log = require('log4js').getLogger('gitpms');

/**
 * Test whether a file or directory exists.
 */
function exists( path, isDir ) {
    return Q.nfcall( fs.stat, path )
    .then(function( stats ) {
        // TODO: Change to stats.isFile() || (isDir && stats.isDirectory)
        // Except check that stats.isFile() == !stats.isDirectory() always
        return true && (!isDir || stats.isDirectory());
    })
    .fail(function() {
        return false;
    });
}

// Regex pattern for matching lines describing active - e.g. non deleted -
// files, as output by the git diff --name-status command.
var ActiveNameStatusLinePattern = /^[ACMRT]\s+(.*)$/;
/**
 * Extract a list of current (e.g. non deleted) files from git diff output.
 * The output is something like 'A  a/file.txt'.
 */
function activeFilesFromGitDiffOutput( lines ) {
    return lines
    // Extract file name if the pattern is matched.
    .map(function( line ) {
        var r = ActiveNameStatusLinePattern.exec( line );
        return r && r[1];
    })
    // Filter out undefined values.
    .filter(function( line ) {
        return !!line;
    })
    // Join back into a space separated string.
    .join(' ');
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
                //Log.debug('stderr: %s', stderr );
                dp.reject( stderr );
            }
            else {
                stdout = Buffer.concat( stdout ).toString();
                //Log.debug('stdout: %s', stdout );
                dp.resolve( stdout.split('\n') );
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
        args.current = current[0];
        args.packageDir = path.resolve( path.join( packageDir, args.current ) );
        args.zipPath = tt.eval('{packageDir}/content.zip', args );
        // Check if a zip file for the current and reference commits
        // has already been created.
        return exists( args.zipPath );
    })
    .then(function( exists ) {
        if( exists ) {
            // Zip file exists, return path.
            return Q( args );
        }
        // Make an output directory for the zip file.
        return exec( repoDir, 'MakeDir', { dir: args.packageDir })
        .then(function() {
            args.ref = args.current;
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
                return exec( repoDir, 'AddFileToZip', { zipPath: args.zipPath, file: filename });
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
        args.current = current[0];
        args.packageDir = path.resolve( path.join( packageDir, args.current, ref ) );
        args.zipPath = tt.eval('{packageDir}/content.zip', args );
        // Check if a zip file for the current and reference commits
        // has already been created.
        return exists( args.zipPath );
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
            var _args = {
                files:      activeFilesFromGitDiffOutput( files ),
                zipPath:    args.zipPath,
                ref:        args.current
            };
            // Make an output directory for the zip file.
            return exec( repoDir, 'MakeDir', { dir: args.packageDir })
            .then(function() {
                // Create a zip file containing all the updated files.
                return exec( repoDir, 'ZipFilesInCommit', _args );
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
                if( file ) {
                    result[file] = true;
                }
                return result;
            }, {});
            return Q( fileset );
        })
        .then(function( fileset ) {
            // List all files in the current commit...
            return exec( repoDir, 'ListFilesInCommit', { commit: args.current })
            .then(function( currFiles ) {
                // ...then delete all matching file names from the
                // reference set.
                currFiles.forEach(function( file ) {
                    if( file ) {
                        delete fileset[file];
                    }
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
                since:      ref,
                deletes:    deletes
            };
            var filename = tt.eval('{packageDir}/.semo-manifest', args );
            return Q.nfcall( fs.writeFile, filename, JSON.stringify( manifest ) )
            .then(function() {
                // Add the manifest file to the zip archive.
                return exec( repoDir, 'AddFileToZip', { zipPath: args.zipPath, file: filename });
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
