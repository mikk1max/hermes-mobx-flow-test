// Standalone reproduction — no Babel, no Expo, no external libraries.
//
// Root cause (found via systematic elimination):
//   Hermes does not correctly expose `arguments` inside a generator body.
//   `arguments` should capture the values from the initial generator invocation,
//   but on Hermes it is empty (or length === 0) when the generator body runs.
//
// Why this surfaces with MobX + Babel:
//   babel-preset-expo with hermes-stable transform profile does NOT transpile
//   generators (Hermes supports them natively), but it DOES transform default
//   parameters. For a generator with a default param:
//
//     flow(function*(value, onSuccess = () => {}) { ... })
//
//   Babel cannot put default params directly inside a generator's formal params,
//   so it moves the check into the generator body:
//
//     flow(function*(value) {
//       var onSuccess = arguments.length > 1 && arguments[1] !== undefined
//           ? arguments[1]
//           : () => {}      // ← default fires because arguments is empty on Hermes
//       yield ...
//       onSuccess(...)
//     })
//
//   On V8/JSC `arguments` inside a generator correctly captures the invocation
//   arguments. On Hermes it does not → the default always fires.

// ─── Minimal repro — zero dependencies ──────────────────────────────────────

function* gen(value) {
    // `arguments` should be ['test', externalCb] — set when gen() was called.
    // On Hermes, arguments.length === 0 → default fires instead of externalCb.
    var cb =
        arguments.length > 1 && arguments[1] !== undefined
            ? arguments[1]
            : function () { print('  [DEFAULT called — Hermes arguments bug]') }

    yield new Promise(function (r) { setTimeout(r, 0) })
    cb('hello from generator, value=' + value)
}

print('--- MINIMAL: arguments inside generator body ---')
var it = gen('test', function (msg) { print('  [EXTERNAL cb fired: ' + msg + ']') })
it.next().value.then(function () { it.next() })

// ─── Confirmation: arguments works fine in a regular function ────────────────

function regular(value) {
    var cb =
        arguments.length > 1 && arguments[1] !== undefined
            ? arguments[1]
            : function () { print('  [DEFAULT called]') }
    cb('hello from regular, value=' + value)
}

setTimeout(function () {
    print('--- CONTROL: arguments inside regular function (should always work) ---')
    regular('test', function (msg) { print('  [EXTERNAL cb fired: ' + msg + ']') })
}, 100)

// ─── Expected output on any engine ──────────────────────────────────────────
//   --- MINIMAL: arguments inside generator body ---
//   [EXTERNAL cb fired: hello from generator]
//   --- CONTROL: arguments inside regular function (should always work) ---
//   [EXTERNAL cb fired: hello from regular]
//
// ─── Actual output on Hermes (Android arm64 / iOS) ──────────────────────────
//   --- MINIMAL: arguments inside generator body ---
//   [DEFAULT called — Hermes arguments bug]   ← arguments.length === 0
//   --- CONTROL: arguments inside regular function (should always work) ---
//   [EXTERNAL cb fired: hello from regular]   ← works fine
