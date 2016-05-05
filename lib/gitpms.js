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

function filterFilesInFolder( line, folderPath ){
    return new RegExp('^(' + folderPath + '.*)$').exec( line );
}

function filesInFolder( lines ) {
    return lines
    // Extract file path name if the pattern is matched.
    .map(function( line ) {
        var r = filterFilesInFolder( line, outputFolder );
        return r && r[1];
    })
    // Filter out undefined values.
    .filter(function( line ) {
        return !!line;
    })
}

/**
 * Create a zip file containing the complete contents of the current commit of
 * a git repo.
 */
function packageCurrent( repoDir, packageDir ) {
    Log.debug('packageCurrent')
    var args = {
        feedItems: [],
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
        args.commit = current[0];
        args.packageDir = path.resolve( path.join( packageDir, args.commit ) );
        args.outputFeedFile = tt.eval('{packageDir}/feed-content.json', args );
        // Check if a zip file for the current and reference commits
        // has already been created.
        return exists( args.outputFeedFile );
    })
    .then(function( exists ) {
        if( exists ) {
            // Zip file exists, return path.
            return Q( args );
        }
        return exec( repoDir, 'ListFilesInCommit', args )
        .then(function( files ) {
            // Make an output directory for the json feed file
            return exec( repoDir, 'MakeDir', { dir: args.packageDir })
            .then(function() {
                //return files;
                return filesInFolder( files );
            })
        })
        // Write a feed with all the content in those files
        // The feed is an array of elements like [ {content: ""} ]
        .then(function( files ){
            Log.debug(files)
            // read all files and add feed item to the args.feedItems
            return Q.all( files.map(function( file, id ){
                // when filtering this may not be required
                if ( !file && file == '' ){
                    return;
                }
                Log.debug('path: ' +  path.join( repoDir, file ))
                return Q.nfcall( fs.readFile, path.join( repoDir, file ) )
                .then(function( fileContent ){
                    //Log.debug("FILE: " + file)
                    if ( fileContent ){
                        // parse the json in file and construct feed item entry
                        var jsonContent = JSON.parse( fileContent );
                        //Log.debug(jsonContent)
                        var feedItem = {
                            id:             id,
                            content:        jsonContent.content,
                            url:            jsonContent.url,
                            path:           jsonContent.path,
                            type:           'page'
                        }
                        // if content in json file contain and id is a post (extra info)
                        if ( jsonContent.id ){
                            Log.debug("is a post")
                            jsonContent.postId =        jsonContent.id;
                            jsonContent.postTitle =     jsonContent.title;
                            jsonContent.postTitleDash = jsonContent.title-dash;
                            jsonContent.postDate =      jsonContent.date;
                            jsonContent.categories =    jsonContent.categories || [];
                            jsonContent.tags =          jsonContent.tags || [];
                            jsonContent.type =          'post';
                        }
                        Log.debug('return: ' + feedItem)
                        Log.debug(fileContent)
                        return args.feedItems[id] = feedItem;
                    }else{
                        Log.debug('else')
                        return;
                    }
                })
            }))
        })
        .then(function( ){
            Log.debug('IN')
            Log.debug('Writing feed file to: %s', args.outputFeedFile );
            return Q.nfcall( fs.writeFile, args.outputFeedFile, JSON.stringify( args.feedItems )) ;
        })
        .then(function() {
            // Return path to zip file as result.
            return Q( args );
        });
    });
}

/**
 * Function to filter lines in a specified folderPath matching lines
 * describing active - e.g. non deleted - files, as output by the
 * git diff --name-status command.
 *
 * @params line the file line returned from a git command
 * @folderPath is the folder in the repo to filter by
 */
function filterFilesFromGitDiffOutput( line, folderPath ){
    return new RegExp('^[ACMRT]\\s+(' + folderPath + '.*)$').exec( line );
}

/**
 * Given the lines from a git command, return an map of files that
 * have changed in a folder.
 */
function activeFilesFromGitDiffOutput( lines ) {
    return lines
    // Extract file path name if the pattern is matched.
    .map(function( line ) {
        var r = filterFilesFromGitDiffOutput( line, outputFolder );
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
 * Returns a promise resolving to the filename of the zip file.
 */
function packageUpdatesSince( ref, repoDir, packageDir ) {
    var args = {
        ref: ref,
        feedItems: []
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
    // Check if a json feed file for the current and reference commits
    // has already been created.
    .then(function( current ) {
        args.current = current[0];
        args.packageDir = path.resolve( path.join( packageDir, args.current, ref ) );
        args.outputFeedFile = tt.eval('{packageDir}/feed-content.json', args );
        return exists( args.outputFeedFile );
    })
    .then(function( exists ) {
        if( exists ) {
            // Feed file exists, return path.
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
        // Write a feed with all the content in those files
        // The feed is an array of elements like [ {content: ""} ]
        .then(function( files ){
            // read all files and add feed item to the args.feedItems
            return Q.all( files.map(function( file, id ){
                return Q.nfcall( fs.readFile, path.join( repoDir, file ) )
                .then(function( fileContent ){
                    if ( fileContent ){
                        // parse the json in file and construct feed item entry
                        var jsonContent = JSON.parse( fileContent );
                        var feedItem = {
                            id:             id,
                            content:        jsonContent.content,
                            url:            jsonContent.url,
                            path:           jsonContent.path,
                            type:           'page'
                        }
                        // if content in json file contain and id is a post (extra info)
                        if ( jsonContent.id ){
                            jsonContent.postId =        jsonContent.id;
                            jsonContent.postTitle =     jsonContent.title;
                            jsonContent.postTitleDash = jsonContent.title-dash;
                            jsonContent.postDate =      jsonContent.date;
                            jsonContent.categories =    jsonContent.categories || [];
                            jsonContent.tags =          jsonContent.tags || [];
                            jsonContent.type =          'post';
                        }
                        return args.feedItems[id] = feedItem;
                    }
                })
            }))
        })
        .then(function( ){
            Log.debug('Writing feed file to: %s', args.outputFeedFile );
            return Q.nfcall( fs.writeFile, args.outputFeedFile, JSON.stringify( args.feedItems )) ;
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
exports.clone = clone;
