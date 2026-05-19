import { flow, makeObservable, observable } from 'mobx'

const emptyCallback = () => {}

export class TestStore {
    log: string[] = []

    constructor() {
        makeObservable(this, {
            log: observable,
            runBroken: flow,
            runFixed: flow,
        })
    }

    // ─── BROKEN ──────────────────────────────────────────────────────────────
    // Default function param = () => {} in generator signature.
    // On Hermes, MobX flow() calls the generator via .apply(ctx, args).
    // Hermes replaces the passed callback with the default () => {},
    // so the external callback is silently dropped.
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

    // ─── FIXED ───────────────────────────────────────────────────────────────
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

    clearLog = () => {
        this.log = []
    }
}

export const testStore = new TestStore()
