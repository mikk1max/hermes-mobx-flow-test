import { flow, makeObservable, observable } from 'mobx'

const emptyCallback = () => {}

// ─── Standalone MobX replica (no MobX dependency) ────────────────────────────
// Mirrors the exact internal call chain from repro.js:
//   flow() → action(generator).apply(ctx, args)
//           → executeAction(fn, scope, arguments)
//           → fn.apply(scope, args)  ← Babel wrapper reads arguments here

function standaloneExecuteAction(fn: Function, scope: any, args: IArguments) {
    // Mirrors MobX's _startAction which calls Array.from(args) before fn.apply.
    // Hypothesis: Hermes invalidates the arguments object after Array.from().
    Array.from(args)
    return fn.apply(scope, args)
}

function standaloneAction(fn: Function) {
    return function actionWrapper(this: any) {
        return standaloneExecuteAction(fn, this, arguments)
    }
}

function standaloneFlow(generator: Function) {
    return function flowWrapper(this: any) {
        const ctx = this
        const args = arguments
        const gen: Generator = (standaloneAction(generator) as Function).apply(ctx, args)
        function step(val: any) {
            const r = gen.next(val)
            if (!r.done) (r.value as Promise<any>).then(step)
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

    clearLog = () => {
        this.log = []
    }
}

export const testStore = new TestStore()
