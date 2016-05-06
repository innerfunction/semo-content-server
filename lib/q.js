var Q = require('q');

for( var id in Q ) exports[id] = Q[id];
exports.Q = Q;

// Peform a an all op, but in a batched manner. Call with an array of deferred promises (or
// functions resolving to deferred promises) and a batch size. The promises will be split
// in to batches of the specified size, the contents of each batch will be resolved in parallel,
// but each batch will be resolved in sequence.
// This is principally to avoid resource errors such as EMFILE (to many open files) that can
// occur when too many operations of a certain kind are done in parallel.
// For this to have any worthwhile effect, items should be an array of functions returning the
// deferred promise for each op. (Otherwise, the operation will probably be performed as the
// items array is constructed).
// Each function will be invoked as the batch it belongs to is being resolved.
exports.ball = function( items, bsize ) {
    bsize = bsize||10;
    var batches = [];
    for( var i = 0; i < items.length; i += bsize ) {
        batches.push( items.slice( i, i + bsize ) );
    }
    return batches.map(function( batch ) {
        return function() {
            return Q.all( batch.map(function( op ) {
                return op();
            }));
        };
    })
    .reduce( Q.when, Q());
}
