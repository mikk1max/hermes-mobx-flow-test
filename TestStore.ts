import { action, flow, makeObservable, observable } from 'mobx'

const emptyCallback = () => {}

// ─── Standalone flow replica using REAL MobX action() ────────────────────────
// Uses the real MobX action() (with _startAction/_endAction and all side effects)
// but replaces flow() with our own minimal implementation.
// If this reproduces the bug → the issue is in action() + Hermes interaction.
// If not → the issue is in flow()'s specific calling pattern or makeObservable.

function standaloneFlow(generator: Function) {
    return function flowWrapper(this: any) {
        const ctx = this
        const args = arguments
        // Use REAL MobX action() here, not our replica
        const gen: Generator = (action('standalone-flow-init', generator) as Function).apply(ctx, args)
        function step(val: any) {
            // Also wrap gen.next in real MobX action(), just like MobX flow() does
            const r = (action('standalone-flow-yield', (gen as any).next) as Function).call(gen, val)
            if (!r.done) Promise.resolve(r.value).then(step)
        }
        step(undefined)
    }
}

export class TestStore {
    log: string[] = []

    constructor() {
        makeObservable(this, {
            log: observable,
            runBroken: flow,
            runFixed: flow,
            runStandaloneBroken: flow,
            runRealFlowManualBabel: flow,
        })
    }

    // ─── BROKEN (real MobX flow) ──────────────────────────────────────────────
    // Default function param = () => {} in generator signature.
    // Babel wraps the generator in a regular function that reads arguments[1].
    // On Hermes, arguments[1] is not correctly populated → default fires instead.
    runBroken = flow(function* (
        this: TestStore,
        value: string,
        onSuccess: (msg: string) => void = () => {},
    ) {
        yield new Promise(resolve => setTimeout(resolve, 50))
        this.log.push(`  inside flow:  value = "${value}"`)
        this.log.push(`  inside flow:  typeof onSuccess = ${typeof onSuccess}`)
        this.log.push(`  calling onSuccess("I am the external callback")...`)
        onSuccess('I am the external callback')
        this.log.push(`  flow done.`)
    }).bind(this)

    // ─── FIXED (real MobX flow) ───────────────────────────────────────────────
    runFixed = flow(function* (
        this: TestStore,
        value: string,
        onSuccess?: (msg: string) => void,
    ) {
        onSuccess = onSuccess ?? emptyCallback
        yield new Promise(resolve => setTimeout(resolve, 50))
        this.log.push(`  inside flow:  value = "${value}"`)
        this.log.push(`  inside flow:  typeof onSuccess = ${typeof onSuccess}`)
        this.log.push(`  calling onSuccess("I am the external callback")...`)
        onSuccess('I am the external callback')
        this.log.push(`  flow done.`)
    }).bind(this)

    // ─── STANDALONE BROKEN (no MobX, manual action chain) ────────────────────
    // Same Babel-generated wrapper pattern, but called through our manual
    // replica of MobX internals — proves the bug is in Hermes, not MobX.
    runStandaloneBroken = standaloneFlow(function (value: string) {
        const onSuccess =
            arguments.length > 1 && arguments[1] !== undefined
                ? (arguments[1] as (msg: string) => void)
                : () => { testStore.log.push(`  [DEFAULT called — bug present]`) }
        return (function* () {
            yield new Promise(resolve => setTimeout(resolve, 50))
            testStore.log.push(`  inside standalone:  value = "${value}"`)
            testStore.log.push(`  inside standalone:  typeof onSuccess = ${typeof onSuccess}`)
            testStore.log.push(`  calling onSuccess("I am the external callback")...`)
            onSuccess('I am the external callback')
            testStore.log.push(`  standalone done.`)
        })()
    })

    // ─── REAL MobX flow() + manually-written Babel wrapper ───────────────────
    // Tests if MobX flow() itself is the trigger, independent of TypeScript
    // compiling "= () => {}" default params.
    // If this reproduces the bug → issue is in MobX flow() + Hermes (not TS/Babel).
    // If not → TypeScript compilation of default params is the specific trigger.
    runRealFlowManualBabel = flow(function (value: string) {
        const onSuccess =
            arguments.length > 1 && arguments[1] !== undefined
                ? (arguments[1] as (msg: string) => void)
                : () => { testStore.log.push('  [DEFAULT called — bug present]') }
        return (function* () {
            yield new Promise(resolve => setTimeout(resolve, 50))
            testStore.log.push(`  inside flow+manual:  value = "${value}"`)
            testStore.log.push(`  inside flow+manual:  typeof onSuccess = ${typeof onSuccess}`)
            testStore.log.push(`  calling onSuccess("I am the external callback")...`)
            onSuccess('I am the external callback')
            testStore.log.push(`  flow+manual done.`)
        })()
    }).bind(this)

    // ─── MINIMAL repro — pure generator, zero deps ───────────────────────────
    // Tests three calling conventions to isolate the exact Hermes trigger:
    //   A) direct call          gen('test', cb)               → should work
    //   B) apply with Array     gen.apply(null, ['test', cb]) → should work
    //   C) apply with Arguments gen.apply(null, outerArgs)    → suspected bug
    //      (this is exactly what MobX action() does internally)
    runMinimal = () => {
        const store = testStore
        const defFn = (label: string) => () => store.log.push(`  [DEFAULT ${label}]`)
        const extCb = (label: string) => (msg: string) => store.log.push(`  ⚪ ${label} fired: ${msg}`)

        // D) default param in generator, direct call — baseline
        store.log.push('D) default param, direct call — no MobX, no this:')
        function* genD(_value: string, onSuccess: (msg: string) => void = defFn('D')) {
            yield new Promise(resolve => setTimeout(resolve, 50))
            onSuccess('ok')
        }
        const itD = (genD as any)('test', extCb('D'))
        itD.next().value.then(() => {
            itD.next()

            // E) via MobX flow(), no `this:` — still works
            store.log.push('E) default param + flow(), no this: — works')
            const flowedE = flow(function* (_value: string, onSuccess: (msg: string) => void = defFn('E')) {
                yield new Promise(resolve => setTimeout(resolve, 50))
                onSuccess('ok')
            })
            ;(flowedE as any)('test', extCb('E'))

            setTimeout(() => {
                // F) THE BUG: `this:` shifts Babel's arguments index by 1
                store.log.push('F) BUG: default param + flow() + this: + bind:')
                const flowedF = flow(function* (this: TestStore, _value: string, onSuccess: (msg: string) => void = defFn('F')) {
                    yield new Promise(resolve => setTimeout(resolve, 50))
                    onSuccess('ok')
                }).bind(this)
                ;(flowedF as any)('test', extCb('F'))

                setTimeout(() => {
                    // G) control: bind() alone without `this:` — works fine
                    store.log.push('G) control: bind() alone, no this: — works')
                    const flowedG = flow(function* (_value: string, onSuccess: (msg: string) => void = defFn('G')) {
                        yield new Promise(resolve => setTimeout(resolve, 50))
                        onSuccess('ok')
                    }).bind(this)
                    ;(flowedG as any)('test', extCb('G'))
                }, 400)

                setTimeout(() => {
                    // H) smoking gun: same as F but callback at arg[2]
                    // proves Babel shifted onSuccess index to 2 because of `this:`
                    store.log.push('H) same as F, cb at arg[2] instead of arg[1]:')
                    store.log.push('   → proves Babel generated arguments[2] for onSuccess')
                    const flowedH = flow(function* (this: TestStore, _value: string, onSuccess: (msg: string) => void = defFn('H')) {
                        yield new Promise(resolve => setTimeout(resolve, 50))
                        onSuccess('ok')
                    }).bind(this)
                    ;(flowedH as any)('test', undefined, extCb('H'))
                }, 600)

                setTimeout(() => {
                    // I) FIXED: same pattern as F but `??` instead of `= () => {}`
                    // avoids the default param transform → Babel never emits arguments[] check
                    store.log.push('I) FIXED version of F (??  instead of = () => {}):')
                    store.log.push('   → no default param transform → no index shift')
                    const flowedI = flow(function* (this: TestStore, _value: string, onSuccess?: (msg: string) => void) {
                        onSuccess = onSuccess ?? defFn('I — should not fire')
                        yield new Promise(resolve => setTimeout(resolve, 50))
                        onSuccess('ok')
                    }).bind(this)
                    ;(flowedI as any)('test', extCb('I'))
                }, 800)
            }, 200)
        })
    }

    clearLog = () => {
        this.log = []
    }
}

export const testStore = new TestStore()
