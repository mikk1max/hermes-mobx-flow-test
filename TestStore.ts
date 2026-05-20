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

    clearLog = () => {
        this.log = []
    }
}

export const testStore = new TestStore()
