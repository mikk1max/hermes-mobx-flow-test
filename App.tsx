import { observer } from 'mobx-react-lite'
import React from 'react'
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { testStore } from './TestStore'

export default observer(function App() {
    const engine = (globalThis as any).HermesInternal ? 'Hermes 🔴' : 'JSC/V8 🟢'

    const runBroken = () => {
        testStore.clearLog()
        testStore.log.push('── BROKEN: cb = () => {} default in signature ──')
        testStore.log.push('calling: runBroken("hello", externalCb)')
        testStore.log.push('externalCb = (msg) => log("🔴 EXTERNAL CB: " + msg)')
        testStore.log.push('')
        testStore.runBroken('hello', (msg) => {
            testStore.log.push(`🔴 EXTERNAL CB fired: "${msg}"`)
        })
    }

    const runFixed = () => {
        testStore.clearLog()
        testStore.log.push('── FIXED: cb? + ?? emptyCallback ──')
        testStore.log.push('calling: runFixed("hello", externalCb)')
        testStore.log.push('externalCb = (msg) => log("🟢 EXTERNAL CB: " + msg)')
        testStore.log.push('')
        testStore.runFixed('hello', (msg) => {
            testStore.log.push(`🟢 EXTERNAL CB fired: "${msg}"`)
        })
    }

    const runMinimal = () => {
        testStore.clearLog()
        testStore.log.push('── MINIMAL: pure generator + arguments[] ──')
        testStore.log.push('No MobX. No flow(). No Babel transform.')
        testStore.log.push('If [DEFAULT] fires → Hermes generator arguments bug.')
        testStore.log.push('')
        testStore.runMinimal()
    }

    const runRealFlowManualBabel = () => {
        testStore.clearLog()
        testStore.log.push('── REAL flow() + manual Babel wrapper ──')
        testStore.log.push('Real MobX flow(), but arguments[] written by hand (not TS compiled).')
        testStore.log.push('If bug fires → MobX flow() is the trigger, not TS/Babel.')
        testStore.log.push('')
        ;(testStore.runRealFlowManualBabel as any)('hello', (msg: string) => {
            testStore.log.push(`🔵 EXTERNAL CB fired: "${msg}"`)
        })
    }

    const runStandalone = () => {
        testStore.clearLog()
        testStore.log.push('── STANDALONE: no MobX, manual action() chain ──')
        testStore.log.push('Same Babel pattern, but MobX replaced by manual replica.')
        testStore.log.push('If bug fires here → Hermes issue, NOT a MobX issue.')
        testStore.log.push('')
        ;(testStore.runStandaloneBroken as any)('hello', (msg: string) => {
            testStore.log.push(`🟡 EXTERNAL CB fired: "${msg}"`)
        })
    }

    return (
        <View style={s.container}>
            <Text style={s.title}>MobX flow() + Hermes  <Text style={s.sub}>{engine} · {Platform.OS}</Text></Text>

            <View style={s.row}>
                <TouchableOpacity style={[s.btn, s.red]} onPress={runBroken}>
                    <Text style={s.btnText}>BROKEN</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.green]} onPress={runFixed}>
                    <Text style={s.btnText}>FIXED</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.purple]} onPress={runMinimal}>
                    <Text style={s.btnText}>MINIMAL</Text>
                </TouchableOpacity>
            </View>
            <View style={s.row}>
                <TouchableOpacity style={[s.btn, s.blue]} onPress={runRealFlowManualBabel}>
                    <Text style={s.btnText}>FLOW+MANUAL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.orange]} onPress={runStandalone}>
                    <Text style={s.btnText}>STANDALONE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.dark]} onPress={() => testStore.clearLog()}>
                    <Text style={s.btnText}>CLEAR</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={s.log}>
                {testStore.log.length === 0 && (
                    <Text style={s.empty}>Press a button to run the test</Text>
                )}
                {testStore.log.map((line, i) => (
                    <Text key={i} style={[
                        s.line,
                        line.startsWith('🔴') && s.red_text,
                        line.startsWith('🟢') && s.green_text,
                        line.startsWith('🟡') && s.yellow_text,
                        line.includes('[DEFAULT') && s.red_text,
                        line.includes('── BROKEN') && s.sectionBroken,
                        line.includes('── FIXED') && s.sectionFixed,
                        line.includes('── STANDALONE') && s.sectionStandalone,
                        line.includes('── MINIMAL') && s.sectionMinimal,
                        line.includes('BUG:') && s.red_text,
                        line.includes('FIXED version') && s.green_text,
                        line.includes('smoking gun') && s.yellow_text,
                        line.startsWith('⚪ I') && s.green_text,
                    ]}>
                        {line}
                    </Text>
                ))}
            </ScrollView>
        </View>
    )
})

const s = StyleSheet.create({
    container: { flex: 1, paddingTop: 52, paddingHorizontal: 12, paddingBottom: Platform.OS === 'android' ? 48 : 16, backgroundColor: '#0d0d0d' },
    title: { color: '#fff', fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
    sub: { color: '#666', fontSize: 11, fontWeight: 'normal' },
    desc: { color: '#aaa', fontSize: 12, lineHeight: 18, marginBottom: 12, backgroundColor: '#1a1a1a', padding: 10, borderRadius: 8 },
    row: { flexDirection: 'row', gap: 6, marginBottom: 0 },
    btn: { flex: 1, backgroundColor: '#2a2a2a', borderRadius: 8, padding: 8, marginBottom: 6 },
    dark: { backgroundColor: '#2a2a2a' },
    red: { backgroundColor: '#7f1d1d' },
    green: { backgroundColor: '#14532d' },
    orange: { backgroundColor: '#78350f' },
    blue: { backgroundColor: '#1e3a5f' },
    purple: { backgroundColor: '#3b1f5e' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' },
    btnSub: { color: '#aaa', fontSize: 11, marginTop: 2 },
    log: { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 10, marginTop: 6 },
    empty: { color: '#444', fontStyle: 'italic', fontSize: 12 },
    line: { color: '#bbb', fontSize: 12, fontFamily: 'monospace', marginBottom: 3 },
    sectionBroken: { color: '#f87171', fontWeight: 'bold' },
    sectionFixed: { color: '#4ade80', fontWeight: 'bold' },
    sectionStandalone: { color: '#fbbf24', fontWeight: 'bold' },
    sectionMinimal: { color: '#c084fc', fontWeight: 'bold' },
    red_text: { color: '#f87171', fontWeight: 'bold' },
    green_text: { color: '#4ade80', fontWeight: 'bold' },
    yellow_text: { color: '#fbbf24', fontWeight: 'bold' },
    clearBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#2a2a2a', borderRadius: 6, marginBottom: 4 },
    clearBtnText: { color: '#aaa', fontSize: 12 },
    verdict: { marginTop: 8, marginBottom: 8, padding: 10, backgroundColor: '#1a1a1a', borderRadius: 8 },
    verdictTitle: { color: '#888', fontSize: 11, marginBottom: 2 },
})
