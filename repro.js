// Standalone reproduction — no Babel, no Expo, no external libraries.
//
// Reproduces the exact MobX flow() + action() call chain that triggers the bug:
//   MobX flow()  →  action(generator).apply(ctx, args)
//                →  executeAction(fn, scope, arguments)  [action wrapper]
//                →  fn.apply(scope, args)                [Babel wrapper reads arguments]
//
// The Babel wrapper is what @babel/plugin-transform-parameters emits for:
//   flow(function*(value, onSuccess = () => {}) { ... })

// ─── Faithful MobX internals replica ────────────────────────────────────────

function executeAction(fn, scope, args) {
    return fn.apply(scope, args)
}

function action(fn) {
    return function actionWrapper() {
        return executeAction(fn, this, arguments)
    }
}

function flow(generator) {
    return function flowWrapper() {
        var ctx = this
        var args = arguments
        // Real MobX line: action(name, generator).apply(ctx, args)
        var gen = action(generator).apply(ctx, args)
        function step(val) {
            var r = gen.next(val)
            if (!r.done) r.value.then(step)
        }
        step(undefined)
    }
}

// ─── Test cases ──────────────────────────────────────────────────────────────

// BROKEN — this is exactly what Babel emits for:
//   flow(function*(value, onSuccess: () => void = () => {}) { ... })
//
// @babel/plugin-transform-parameters cannot put default params directly
// inside a generator, so it wraps it in a regular function that reads arguments[1].
var broken = flow(function (value) {
    var onSuccess =
        arguments.length > 1 && arguments[1] !== undefined
            ? arguments[1]
            : function () { print('  [DEFAULT called — bug present]') }
    return (function* () {
        yield new Promise(function (r) { setTimeout(r, 0) })
        onSuccess('hello from generator')
    })()
})

// FIXED — optional param + nullish coalescing stays as a genuine generator.
// Babel does NOT wrap this in a regular function, so arguments is never read.
var fixed = flow(function* (value, onSuccess) {
    onSuccess = onSuccess != null ? onSuccess : function () {}
    yield new Promise(function (r) { setTimeout(r, 0) })
    onSuccess('hello from generator')
})

// ─── Run ─────────────────────────────────────────────────────────────────────

print('--- BROKEN (Babel default param pattern + MobX action chain) ---')
broken('test', function (msg) { print('  [EXTERNAL cb fired: ' + msg + ']') })

setTimeout(function () {
    print('--- FIXED (genuine generator, no arguments-based detection) ---')
    fixed('test', function (msg) { print('  [EXTERNAL cb fired: ' + msg + ']') })
}, 50)

// Expected on any engine:
//   --- BROKEN ---
//   [EXTERNAL cb fired: hello from generator]
//   --- FIXED ---
//   [EXTERNAL cb fired: hello from generator]
//
// Actual on Hermes (Android arm64):
//   --- BROKEN ---
//   [DEFAULT called — bug present]          ← external cb silently replaced
//   --- FIXED ---
//   [EXTERNAL cb fired: hello from generator]
