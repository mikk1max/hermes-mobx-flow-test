// Reproduction — identifies the root cause of the MobX flow() + Hermes default param bug.
//
// ─── Root cause ──────────────────────────────────────────────────────────────
//
// NOT a Hermes engine bug. A Babel plugin ordering bug in babel-preset-expo
// (hermes-stable transform profile):
//
//   @babel/plugin-transform-parameters  runs BEFORE  @babel/preset-typescript
//
// When Babel sees a generator with a TypeScript `this:` pseudo-parameter AND a
// default parameter:
//
//   function*(this: TestStore, value: string, onSuccess = () => {}) { ... }
//
// it counts `this:` as argument index 0, shifting `onSuccess` to index 2:
//
//   function*(_value) {
//     var onSuccess =
//       arguments.length > 2 && arguments[2] !== undefined  // ← should be > 1 / [1]
//         ? arguments[2]
//         : () => {}
//   }
//
// TypeScript then strips `this:` from the formal params, but the arguments
// check is already wrong.  Calling with 2 real args → arguments.length = 2 →
// `> 2` is false → default always fires.
//
// The bug appears Hermes-specific because:
//   - Web/V8 Babel config: preserves native default param syntax — V8 never
//     sees the broken arguments[] check.
//   - iOS/Android Hermes Babel config (hermes-stable): transforms default
//     params to arguments[] checks — Hermes receives the incorrectly compiled
//     bytecode.
//
// ─── Proof ───────────────────────────────────────────────────────────────────
//
// Empirical test matrix (Expo RN app, Hermes on iOS):
//
//   D) flow(function*(_v, onSuccess = def))          direct call    → OK
//   E) flow(function*(_v, onSuccess = def))          via flow()     → OK
//   F) flow(function*(this:T, _v, onSuccess = def))  via flow()+bind → BROKEN  ← this: shifts index
//   G) flow(function*(_v, onSuccess = def))          via flow()+bind → OK      ← no this:, no shift
//   H) same as F, but called with 3 args             via flow()+bind → OK      ← arg lands at [2]
//
// H is the smoking gun: passing the callback as the THIRD argument (index 2)
// fixes the bug, proving Babel generated arguments[2] instead of arguments[1].
//
// ─── Fix ─────────────────────────────────────────────────────────────────────
//
// Replace default param syntax with an explicit nullish-coalescing fallback:
//
//   BROKEN:  function*(this: T, value, onSuccess = () => {}) { ... }
//   FIXED:   function*(this: T, value, onSuccess?: () => void) {
//                onSuccess = onSuccess ?? () => {}
//                ...
//            }
//
// This avoids the default param transform entirely; TypeScript/Babel never
// emit the broken arguments[] check.
//
// ─── Where to file ───────────────────────────────────────────────────────────
//
// @babel/plugin-transform-parameters should not count TypeScript's `this:`
// pseudo-parameter when computing argument indices for default param checks.
// File against: babel-preset-expo  OR  @babel/plugin-transform-parameters
//   (when composed with @babel/preset-typescript / @babel/plugin-transform-typescript)
