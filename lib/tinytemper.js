// A very simple template engine.

// Regex for parsing templates.
// Attempts to match the following groups:
// 1. Prefix not containing a { character.
// 2. A valid reference between { and } characters.
// 3. Suffix after a } character.
var re = /^([^{]*)[{]([-a-zA-Z0-9_$.]+)[}]([\s\S]*)$/;

// Create a compiled template text node.
function text( text ) {
    // Return a function which returns the text.
    return function() { return text; }
}

// Create a compiled template reference node.
function ref( ref ) {
    // Ref is a dotted path reference - break into an array of path components.
    ref = ref.split('.');
    // Return a function which resolves the reference against a data context.
    return function( cx ) {
        return resolve( ref, cx );
    };
}

// Resolve a dotted path reference against a data context.
// The reference is passed as an array of path components.
function resolve( ref, cx ) {
    for( var i = 0; i < ref.length && cx !== undefined; cx = cx[ref[i++]] );
    return cx;
}

// Parse a template string into a compiled template.
// Returns a function which can be evaluated against a data context.
function parse( t ) {
    var c = [];                         // An array of compiled template nodes (functions).
    while( t ) {                        // While still a template string to parse...
        var r = re.exec( t );           // Match the template string against the parse regex.
        if( r ) {                       // If match found...
            c.push( text( r[1] ) );     // Then first group is the reference prefix...
            c.push( ref( r[2] ) );      // Followed by a data reference...
            t = r[3];                   // Followed by the unparsed suffix.
        }
        else {                          // Else no match found.
            var i = t.indexOf('}');     // Check for possible invalid reference...
            if( i > -1 ) {              // ...and if found...
                c.push( text( t.substring( 0, i ) ) );  // ...then add string up to }
                t = t.substring( i + 1 );               // ...and continue parsing after the }
            }
            else {                      // No more references in the template,
                c.push( text( t ) );    // so append the rest of the template text...
                t = false;              // ...and finish parsing.
            }
        }
    }
    // Return a function to evaluate the compiled template against a data context.
    return function( ctx ) {
        var s = '';                             // The result string.
        for( var i = 0; i < c.length; i++ ) {   // Iterate over the template nodes...
            s += c[i]( ctx );                   // ...and eval against the context.
        }
        return s;                               // Return the result string.
    };
}

// Cache of previously compiled templates.
var cache = {};
// Parse a template string.
exports.parse = function( t ) {
    var f = cache[t];
    if( !f ) {
        f = cache[t] = parse( t );
    }
    return f;
};
// Evaluate a template string against the specified context object.
exports.eval = function( t, c ) {
    return exports.parse( t )( c );
};
