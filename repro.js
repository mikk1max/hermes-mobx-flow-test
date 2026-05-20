// Standalone reproduction — no Babel, no Expo, no external libraries.
// Manually reproduces what @babel/plugin-transform-parameters generates
// for a generator function with a function-typed default parameter.

// Minimal stand-in for MobX flow() — calls fn.apply(this, arguments)
function flow(fn) {
    return function () {
        var args = arguments
        var gen = fn.apply(this, args)
        function step(val) {
            var r = gen.next(val)
            if (!r.done) r.value.then(step)
        }
        step(undefined)
    }
}

// BROKEN — this is what Babel emits for:
//   flow(function*(value, onSuccess = () => {}) { ... })
// The generator is wrapped in a regular function that reads arguments[1].
var broken = flow(function (value) {
    var onSuccess =
        arguments.length > 1 && arguments[1] !== undefined
            ? arguments[1]
            : function () { print('  [DEFAULT called — bug present]') }
    return (function* () {
        yield new Promise(function (r) { setTimeout(r, 0) })
        onSuccess('hello')
    })()
})

// FIXED — genuine generator, no arguments-based detection
var fixed = flow(function* (value, onSuccess) {
    onSuccess = onSuccess != null ? onSuccess : function () {}
    yield new Promise(function (r) { setTimeout(r, 0) })
    onSuccess('hello')
})

print('--- BROKEN ---')
broken('test', function (msg) { print('  [EXTERNAL cb fired: ' + msg + ']') })

setTimeout(function () {
    print('--- FIXED ---')
    fixed('test', function (msg) { print('  [EXTERNAL cb fired: ' + msg + ']') })
}, 50)
