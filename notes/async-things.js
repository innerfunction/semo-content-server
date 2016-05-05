

/// OPTION 1
// The problem is that we cannot controll when all the readFiles happen
.then(function() {
    return activeFilesFromGitDiffOutput();
})
.then( function( files ){
    // HERE
    files.forEach( function( file, index ){
        return Q.nfcall( fs.readFile, path.join( repoDir, file ))
        .then(function( fileContent ){
            var item = JSON.parse( fileContent );
            item.id = createHash( item.url );
            Log.debug('ITEM+');
            //Log.debug(item)
            return args.items[id] = item;
        })
    })
    return;
})


// OPTION 2 Q.all
// Get a list of files updated since the reference commit.
// Note that this won't contain information on all deletes.
.then( function( files ){
    return Q.all( files.map( function( file, id ){
        return Q.nfcall( fs.readFile, path.join( repoDir, file ))
        .then(function( fileContent ){
            var item = JSON.parse( fileContent );
            item.id = createHash( item.url );
            return args.items[id] = JSON.stringify( item );
        })
    }))
})
