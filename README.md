# `babel-preset-expo` hermes-stable: off-by-one in default param argument indices for generators with TypeScript `this:` annotation

**Root cause: plugin ordering bug in `babel-preset-expo`, not a Hermes engine bug.**

---

## What happens

When a MobX `flow()` generator has a TypeScript `this:` annotation **and** a function-typed default parameter, the externally passed callback is silently ignored on Hermes. The default `() => {}` fires instead.

```typescript
runBroken = flow(function* (this: TestStore, value: string, onSuccess = () => {}) {
    yield ...
    onSuccess('hello')  // always calls the default — never the passed callback
}).bind(this)
```

The bug is **silent**: `typeof onSuccess` still returns `"function"` (it is the default), so no errors are thrown.

---

## Root cause

In `babel-preset-expo` with the `hermes-stable` transform profile, `@babel/plugin-transform-parameters` is added to the top-level `plugins` array. Babel runs **plugins before presets**, so this plugin sees the TypeScript `this:` pseudo-parameter before `@babel/plugin-transform-typescript` (inside `@react-native/babel-preset`) has a chance to strip it.

With `this:` counted as index 0, `onSuccess` (the second real parameter) is assigned index **2** instead of **1**:

```javascript
// What babel-preset-expo hermes-stable actually emits — WRONG:
function* (value) {
    var onSuccess =
        arguments.length > 2 && arguments[2] !== undefined  // ← should be > 1 / [1]
            ? arguments[2]
            : () => {};
}
```

Called with 2 real arguments → `arguments.length = 2` → `> 2` is `false` → **default always fires**.

### Why it looks Hermes-specific

The web/V8 Babel config keeps native default param syntax — V8 never sees the `arguments[]` check. The `hermes-stable` profile transforms default params to `arguments[]` checks, so Hermes receives and executes the incorrectly indexed bytecode.

---

## Smoking-gun proof

Passing the callback as the **third** argument (index 2) makes it work on Hermes:

```js
runBroken('test', undefined, myCallback)  // ✅ works — cb lands at arguments[2]
runBroken('test', myCallback)             // ❌ broken — cb at arguments[1], check is > 2
```

---

## Test cases (D–H)

| Case | `this:` annotation | default param | Result on Hermes |
|------|-------------------|---------------|-----------------|
| D | no | yes | ✅ works |
| E | no (via flow) | yes | ✅ works |
| F | yes | yes | ❌ **broken** |
| G | no (via flow + bind) | yes | ✅ works |
| H | yes, 3rd arg passed | yes | ✅ works (smoking gun) |

Case F is the only one broken. Case H proves `arguments[2]` is the generated index.

---

## Fix

The same file already uses the correct pattern for `@babel/plugin-transform-export-namespace-from`. The fix is to move both plugins to `babelPresetReactNativeEnv.overrides` so they run **after** TypeScript stripping.

**`babel-preset-expo/build/index.js`**

```javascript
// BEFORE (buggy, ~line 105): added to extraPlugins → runs before TypeScript stripping
else if (!isModernEngine) {
    extraPlugins.push(require('@babel/plugin-transform-parameters'),
        [require('@babel/plugin-transform-class-static-block'), { loose: true }]);
}

// AFTER (fixed, ~line 249): added to overrides → runs after TypeScript stripping
babelPresetReactNativeEnv.overrides.push({
    plugins: [
        require('@babel/plugin-transform-parameters'),
        [require('@babel/plugin-transform-class-static-block'), { loose: true }],
    ],
});
```

This repo includes a `patch-package` patch that applies this fix. Run `yarn install` — `postinstall` applies it automatically.

---

## Environment

- `babel-preset-expo`: 54.0.10
- `@react-native/babel-preset`: bundled with RN 0.81.5
- Platform: iOS + Android (Hermes)
- `unstable_transformProfile: 'hermes-stable'`

---

## Workaround (without patch)

Remove the TypeScript `this:` annotation, or avoid function-typed default parameters in generators and use nullish coalescing in the body instead:

```typescript
// ❌ Broken on Hermes
runBroken = flow(function* (this: MyStore, value: string, onSuccess = () => {}) { ... })

// ✅ Safe — no this: annotation shifts the index
runFixed1 = flow(function* (value: string, onSuccess = () => {}) { ... }).bind(this)

// ✅ Safe — no arguments[] transform needed
const noop = () => {}
runFixed2 = flow(function* (this: MyStore, value: string, onSuccess?: () => void) {
    onSuccess = onSuccess ?? noop
    ...
}).bind(this)
```

---

## Related

- [babel/babel#8840](https://github.com/babel/babel/issues/8840) — same plugin-ordering root cause, rest parameters
- Filed against expo/expo: [link TBD]
