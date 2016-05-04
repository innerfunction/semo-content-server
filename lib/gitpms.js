var Q = require('q');
var tt = require('./tinytemper');
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');

// The output folder for the json content
var outputFolder = 'output-json';
var outputFeedFileName = 'semo-feed.json';

// Comamnd used by the procedure.
var Commands = {
    // TODO: https not suported for git.innerfunction.com, disable for git also at the moment
    //'CloneGit':               "git clone https://{username}:{password}@{server}/{feed}.git",
    'CloneGit':                 "git clone http://{username}:{password}@{server}/{feed}.git .",
    'Pull':                     "git pull",
    'CurrentCommit':            "git log --pretty=format:%h -n 1",
    'ListUpdatesSinceCommit':   "git diff --name-status {ref} {current}",
    'ZipFilesInCommit':         "git archive -o {zipPath} {ref}:{folder}",
    'ListFilesInCommit':        "git show --pretty=format: --name-only {commit}",
    'ListTrackedFilesAtCommit': "git ls-tree -r --name-status {commit}:{folder}",
    'AddFileToZip':             "zip {zipPath} -j {file}",
    'MakeDir':                  "mkdir -p {dir}",
    'CatFile':                  "cat {repoDir}/{file}"

};
//">> /Users/jloriente/workspace-git/semo-content-server/cooooo/json.json"
var Log = require('log4js').getLogger('gitpms');

/**
 * Test whether a file or directory exists.
 */
function exists( path, isDir ) {
    Log.debug(path)
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
                Log.debug('stderr: %s', stderr );
                dp.reject( stderr );
            }
            else {
                stdout = Buffer.concat( stdout ).toString();
                Log.debug('stdout: %s', stdout );
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
 * Clone a GitHub repo in the local file system. Every repo will be placed in
 * a /gitusername/projectname folder.
 * @param feed: the feed to the repo, something like innefunction/semo-repo
 * @param username/pass: GitHub username and password.
 * @param beseReposDir: the base path to the repos folder
 */
// TODO: support any Git server, not just GitHub
function clone( repoDir, server, username, password, feed ){
    // Check if the repo already exist in the file system
    return exists( repoDir, true  )
    .then(function( repoExist ){
        if( repoExist ) {
            Log.debug('repoDir already exist: %s . Skipping clone.', repoDir )
            throw new Error('REPO_ALREADY_EXIST');
            //return Q();
        }else{
            Log.debug("Creating local repo: %s", repoDir );
            return exec( ".", 'MakeDir' , { dir: repoDir } )
            .then(function(){
                var args =  { server: server, username: username, password: password, feed: feed };
                return exec( repoDir, 'CloneGit' , args);
            })
            .then(function( msg ){
                Log.debug("New repo cloned to: %s", repoDir );
                Log.debug("msg: %s", msg)
                return Q();
            })
            .fail(function( error ){
                // A bug in the git clone commands writes into stderr
                // even when the clone went ok. It writtes "Cloning into '{repo}'..."
                // so this is a hack to fix that problem. TODO: Test with other git versions.
                if ( error.indexOf('remote') != -1 || error.indexOf('fatal') != -1 ){
                    Log.error(error);
                    throw new Error('GIT_ERROR: ' + error);
                }else{
                    Log.debug("New repo cloned and ready to be used.");
                    return Q();
                }
            })
        }
    })
}

/**
 * Create a zip file containing the complete contents of the current commit of
 * a git repo.
 */
function packageCurrent( repoDir, packageDir ) {
    Log.debug('packageCurrent')
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
            args.folder = outputFolder;
            // Create a zip file containing all content files.
            Log.debug( "ZipFilesInCommit")
            Log.debug(args)
            return exec( repoDir, 'ZipFilesInCommit', args );
        })
        .then(function() {
            // Generate the manifest file.
            var manifest = {
                repo:   path.basename( repoDir ),
                commit: args.current,
                status: 'current-content'
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

// Regex pattern for matching lines describing active - e.g. non deleted -
// files, as output by the git diff --name-status command.
// It filters by folder path
function filterFilesFromGitDiffOutput( line ){
    var ActiveNameStatusLinePattern = new RegExp('^[ACMRT]\\s+(' + outputFolder + '.*)$');
    return ActiveNameStatusLinePattern.exec( line );
}

// Return an map of files paths
function activeFilesFromGitDiffOutput( lines ) {
    return lines
    // Extract file path name if the pattern is matched.
    .map(function( line ) {
        var r = filterFilesFromGitDiffOutput( line );
        return r && r[1];
    })
    // Filter out undefined values.
    .filter(function( line ) {
        return !!line;
    })
}
/**
 * Create a zip file containing all updates since a reference commit in
 * a folder inside a git repo.
 *
 * Returns a promise resolving to the filename of the zip file.
 */
function packageUpdatesSince( ref, repoDir, packageDir ) {
    var args = {
        ref: ref,
        filesContent: []
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
        args.outputFile = tt.eval('{packageDir}/feed-content.json', args );
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
            // Make an output directory for the json feed file
            return exec( repoDir, 'MakeDir', { dir: args.packageDir })
            .then(function() {
                return activeFilesFromGitDiffOutput( files );
            })
        })
        .then(function( files ){
            files.map(function( file ){
                Log.debug('LOOPING FILE: ' + file)
                // Write a json file with the content of every file
                args.file = file;
                return exec( ".", 'CatFile', { file: file, repoDir: repoDir, packageDir: args.packageDir })
                .then(function( fileContent ){
                    // Check if the file has content
                    if ( fileContent && fileContent[0] && fileContent[0] !== ""){
                        Log.debug('Writting file content to outputFile: %s', args.outputFile )
                        return Q.nfcall( fs.writeFile, args.outputFile, JSON.stringify( fileContent ) );
                    }
                })
                .fail(function(err){
                    Log.error(err);
                })
            })
        })
        // .then(function() {
        //     // List all files being tracked at the reference commit. This is the
        //     // first step to detect all files deleted since the
        //     // reference commit.
        //     return exec( repoDir, 'ListTrackedFilesAtCommit', { commit: ref, folder: outputFolder });
        // })
        // .then(function( files ) {
        //     // Create an object for quick lookup of the files in the
        //     // reference commit.
        //     var fileset = files.reduce(function( result, file ) {
        //         if( file ) {
        //             result[file] = true;
        //         }
        //         return result;
        //     }, {});
        //     return Q( fileset );
        // })
        // .then(function( fileset ) {
        //     // List all files in the current commit...
        //     return exec( repoDir, 'ListTrackedFilesAtCommit', { commit: args.current, folder: outputFolder })
        //     .then(function( currFiles ) {
        //         // ...then delete all matching file names from the
        //         // reference set.
        //         currFiles.forEach(function( file ) {
        //             if( file ) {
        //                 delete fileset[file];
        //             }
        //         });
        //         // What is left in fileset are the files in the reference
        //         // commit which aren't in the current commit - i.e.
        //         // the files deleted since the reference commit.
        //         return Object.keys( fileset );
        //     });
        // })
        // .then(function( deletes ) {
        //     // Generate the manifest file.
        //     var manifest = {
        //         repo:       path.basename( repoDir ),
        //         commit:     args.current,
        //         status:     'update-since',
        //         since:      ref,
        //         deletes:    deletes
        //     };
        //     var filename = tt.eval('{packageDir}/.semo-manifest', args );
        //     return Q.nfcall( fs.writeFile, filename, JSON.stringify( manifest ) )
        //     .then(function() {
        //         // Add the manifest file to the zip archive.
        //         //return exec( repoDir, 'AddFileToZip', { zipPath: args.zipPath, file: filename });
        //     });
        // })
        .then(function() {
            // Return path to zip file as result.
            return Q( args );
        });
    });
}
exports.current = current;
exports.packageCurrent = packageCurrent;
exports.packageUpdatesSince = packageUpdatesSince;
exports.clone = clone;
