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

    return (
        <View style={s.container}>
            <Text style={s.title}>MobX flow() + Hermes default param bug</Text>
            <Text style={s.sub}>Engine: {engine}  |  Platform: {Platform.OS}</Text>
            <Text style={s.desc}>
                We pass an external callback to a MobX flow().{'\n'}
                If the bug is present — the external callback never fires.{'\n'}
                Only the default {"() => {}"} runs silently instead.
            </Text>

            <View style={s.row}>
                <TouchableOpacity style={[s.btn, s.red]} onPress={runBroken}>
                    <Text style={s.btnText}>▶ Run BROKEN</Text>
                    <Text style={s.btnSub}>with default param</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.green]} onPress={runFixed}>
                    <Text style={s.btnText}>▶ Run FIXED</Text>
                    <Text style={s.btnSub}>with ?? fallback</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.clearBtn} onPress={() => testStore.clearLog()}>
                <Text style={s.clearBtnText}>Clear</Text>
            </TouchableOpacity>

            <ScrollView style={s.log}>
                {testStore.log.length === 0 && (
                    <Text style={s.empty}>Press a button to run the test</Text>
                )}
                {testStore.log.map((line, i) => (
                    <Text key={i} style={[
                        s.line,
                        line.startsWith('🔴') && s.externalFired,
                        line.startsWith('🟢') && s.success,
                        line.includes('── BROKEN') && s.sectionBroken,
                        line.includes('── FIXED') && s.sectionFixed,
                    ]}>
                        {line}
                    </Text>
                ))}
            </ScrollView>

            <View style={s.verdict}>
                <Text style={s.verdictTitle}>If BROKEN: external cb never appears below "flow done"</Text>
                <Text style={s.verdictTitle}>If FIXED: 🟢 EXTERNAL CB fired appears</Text>
            </View>
        </View>
    )
})

const s = StyleSheet.create({
    container: { flex: 1, paddingTop: 56, paddingHorizontal: 16, paddingBottom: Platform.OS === 'android' ? 48 : 24, backgroundColor: '#0d0d0d' },
    title: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
    sub: { color: '#888', fontSize: 12, marginTop: 2, marginBottom: 8 },
    desc: { color: '#aaa', fontSize: 12, lineHeight: 18, marginBottom: 12, backgroundColor: '#1a1a1a', padding: 10, borderRadius: 8 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    btn: { flex: 1, backgroundColor: '#2a2a2a', borderRadius: 8, padding: 12 },
    red: { backgroundColor: '#7f1d1d' },
    green: { backgroundColor: '#14532d' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    btnSub: { color: '#aaa', fontSize: 11, marginTop: 2 },
    log: { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 10, marginTop: 8 },
    empty: { color: '#444', fontStyle: 'italic', fontSize: 12 },
    line: { color: '#bbb', fontSize: 12, fontFamily: 'monospace', marginBottom: 3 },
    sectionBroken: { color: '#f87171', fontWeight: 'bold' },
    sectionFixed: { color: '#4ade80', fontWeight: 'bold' },
    externalFired: { color: '#f87171', fontWeight: 'bold' },
    success: { color: '#4ade80', fontWeight: 'bold' },
    clearBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#2a2a2a', borderRadius: 6, marginBottom: 4 },
    clearBtnText: { color: '#aaa', fontSize: 12 },
    verdict: { marginTop: 8, marginBottom: 8, padding: 10, backgroundColor: '#1a1a1a', borderRadius: 8 },
    verdictTitle: { color: '#888', fontSize: 11, marginBottom: 2 },
})
