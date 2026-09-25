// gen-svp.mjs
// Convert a MIDI file into Synthesizer V .svp project files.
//   node gen-svp.mjs <midi> [--sv1] [--sv2] [--outdir <dir>] [--prefix <name>]
// Produces one SV track per MIDI track (skip track 0 = conductor).
// Lyrics "la", pitch = MIDI note number (C4=60), duration -> blick via SV.QUARTER.
// Blick = MIDI tick * (SV.QUARTER / PPQ) ; SV.QUARTER = 705600000 (1 beat).

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const mf = require("midi-file")

const SV_QUARTER = 705600000 // blick per beat / quarter note

// Parse args
const args = process.argv.slice(2)
const midiPath = args.find(a => !a.startsWith("--"))
if (!midiPath) { console.error("usage: node gen-svp.mjs <midi> [--sv1] [--sv2] [--outdir d] [--prefix n]"); process.exit(1) }
const opts = { sv1: true, sv2: true, outdir: path.dirname(midiPath), prefix: "NotMyParadiso" }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === "--sv1") opts.sv1 = true
  else if (a === "--sv2") opts.sv2 = true
  else if (a === "--outdir") opts.outdir = args[++i]
  else if (a === "--prefix") opts.prefix = args[++i]
}

const midi = mf.parseMidi(fs.readFileSync(midiPath))
const PPQ = midi.header.ticksPerBeat
const BPM_FACTOR = SV_QUARTER / PPQ        // 705600000/128 = 5512500

// --- tempo & meter -------------------------------------------------------
const setTempo = midi.tracks.flatMap(t => t.filter(e => e.type === "setTempo"))
const microsPerBeat = setTempo.length ? setTempo[0].microsecondsPerBeat : null
const bpm = microsPerBeat ? Math.round(60000000 / microsPerBeat * 100) / 100 : 120
// time signature events (default 4/4; only use first if present)
const tsArr = midi.tracks.flatMap(t => t.filter(e => e.type === "timeSignature"))
const meter = tsArr.length
  ? [{ index: 0, numerator: tsArr[0].numerator, denominator: tsArr[0].denominator }]
  : [{ index: 0, numerator: 4, denominator: 4 }]

// --- extract notes per track (skip conductor track 0) --------------------
function trackNotes(t) {
  let abs = 0, on = new Map(), out = []
  for (const e of t) {
    abs += e.deltaTime
    if (e.type === "noteOn" && e.velocity > 0) on.set(e.noteNumber, abs)
    else if ((e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0)) && on.has(e.noteNumber)) {
      const s = on.get(e.noteNumber); on.delete(e.noteNumber)
      out.push({ pitch: e.noteNumber, onsetBlick: Math.round(s * BPM_FACTOR), durBlick: Math.round((abs - s) * BPM_FACTOR) })
    }
  }
  out.sort((a, b) => a.onsetBlick - b.onsetBlick)
  return out
}

const trackNotesFold = []
midi.tracks.forEach((t, i) => {
  if (i === 0) return
  const notes = trackNotes(t)
  const name = t.find(e => e.type === "trackName")?.text || `轨 ${i}`
  if (notes.length) trackNotesFold.push({ name, notes })
})

const uuid = () => crypto.randomUUID()
const emptyParams = () => ({
  pitchDelta: { mode: "cubic", points: [] },
  vibratoEnv: { mode: "cubic", points: [] },
  loudness: { mode: "cubic", points: [] },
  tension: { mode: "cubic", points: [] },
  breathiness: { mode: "cubic", points: [] },
  voicing: { mode: "cubic", points: [] },
  gender: { mode: "cubic", points: [] },
  toneShift: { mode: "cubic", points: [] },
  mouthOpening: { mode: "cubic", points: [] },
})
const sv1Params = () => { const p = emptyParams(); delete p.mouthOpening; return p } // SV1 has 8 params
const emptyDb = () => ({ name: "", language: "", phoneset: "", languageOverride: "", phonesetOverride: "", backendType: "", version: "-2" })
const emptyVoice = () => ({ vocalModeInherited: true, vocalModePreset: "", vocalModeParams: {} })
const emptyMixer = () => ({ gainDecibel: 0.0, pan: 0.0, mute: false, solo: false, display: true, fxPresetName: "", fxParams: {} })

const SV1_ATTR = (n) => ({
  musicalType: "singing", onset: n.onsetBlick, duration: n.durBlick, lyrics: "la", phonemes: "", accent: "",
  pitch: n.pitch, detune: 0, instantMode: false,
  attributes: { evenSyllableDuration: true },
  systemAttributes: { tF0Offset: 0.0, tF0Left: 0.1, tF0Right: 0.1, dF0Left: 0.0, dF0Right: 0.0, dF0Vbr: 0.0, evenSyllableDuration: true },
  pitchTakes: { activeTakeId: 0, takes: [{ id: 0, expr: 0.0, liked: false }] },
  timbreTakes: { activeTakeId: 0, takes: [{ id: 0, expr: 0.0, liked: false }] },
})
const SV2_ATTR = (n) => ({
  uuid: uuid(), musicalType: "singing", onset: n.onsetBlick, duration: n.durBlick, lyrics: "la", phonemes: "", accent: "",
  pitch: n.pitch, detune: 0,
  attributes: { rTone: 0.0, rIntonation: 0.0, evenSyllableDuration: true, muted: false },
  takes: { activeTakeId: 0, takes: [{ id: 0, seedDuration: 0, seedPitch: 0, seedTimbre: 0, liked: false }] },
})

// ---- colors for tracks ----
const COLORS = ["ff7db235", "ff4794cb", "ff964f73", "ffb0613f", "ff4f6fb8", "ff8a6b3f"]

// =====================  SV2 (version 196)  ===============================
function buildSV2() {
  const library = []
  const tracks = []
  trackNotesFold.forEach((tr, idx) => {
    const mgUuid = uuid(), refUuid = uuid(), grpUuid = uuid(), libUuid = uuid()
    const firstOn = tr.notes[0].onsetBlick
    const lastEnd = tr.notes[tr.notes.length - 1].onsetBlick + tr.notes[tr.notes.length - 1].durBlick
    const baseDb = emptyDb(), baseVoice = emptyVoice(), takes = { activeTakeId: 0, takes: [{ id: 0, seedDuration: 0, seedPitch: 0, seedTimbre: 0, liked: false }] }

    library.push({
      name: tr.name, uuid: libUuid, parameters: emptyParams(), vocalModes: {}, pitchControls: [],
      notes: tr.notes.map(SV2_ATTR), musicalScale: { type: "Major", root: "C" },
    })

    tracks.push({
      name: tr.name, dispColor: COLORS[idx % COLORS.length], dispOrder: idx, renderEnabled: false,
      mixer: emptyMixer(),
      mainGroup: {
        name: "main", uuid: mgUuid, parameters: emptyParams(), vocalModes: {}, pitchControls: [], notes: [],
        musicalScale: { type: "Major", root: "C" },
      },
      mainRef: {
        uuid: refUuid, groupID: mgUuid, blickAbsoluteBegin: 0, blickAbsoluteEnd: -1, blickOffset: 0,
        pitchOffset: 0, mute: false, isInstrumental: false,
        database: { ...baseDb }, dictionary: "", voice: baseVoice, voicePresetName: "", takes: { ...takes },
        timestampLMR: 0, timestampLRSR: 0,
      },
      groups: [{
        uuid: grpUuid, groupID: libUuid,
        blickAbsoluteBegin: firstOn, blickAbsoluteEnd: lastEnd, blickOffset: 0, pitchOffset: 0,
        mute: false, isInstrumental: false,
        database: { ...baseDb }, dictionary: "", voice: baseVoice, voicePresetName: "", takes: { ...takes },
        timestampLMR: 0, timestampLRSR: 0,
      }],
    })
  })
  return {
    version: 196,
    uuid: uuid(),
    time: { meter, tempo: [{ position: 0, bpm }], startTimeSeconds: 0.0 },
    library, tracks,
    renderConfig: { destination: "", filename: "未命名", numChannels: 1, aspirationFormat: "noAspiration", bitDepth: 16, sampleRate: 44100, exportMixDown: true, exportPitch: false, bypassPan: false, bypassGain: false, bypassEffects: false },
    projectMixer: { linkRoomSettings: true },
  }
}

// =====================  SV1 (version 153)  ===============================
function buildSV1() {
  const tracks = []
  trackNotesFold.forEach((tr, idx) => {
    const mgUuid = uuid(), takes = { activeTakeId: 0, takes: [{ id: 0, expr: 0.0, liked: false }] }
    tracks.push({
      name: tr.name, dispColor: COLORS[idx % COLORS.length], dispOrder: idx, renderEnabled: false,
      mixer: emptyMixer(),
      mainGroup: {
        name: "main", uuid: mgUuid, parameters: sv1Params(), vocalModes: {},
        notes: tr.notes.map(SV1_ATTR),
      },
      mainRef: {
        groupID: mgUuid, blickAbsoluteBegin: 0, blickAbsoluteEnd: -1, blickOffset: 0, pitchOffset: 0,
        isInstrumental: false, systemPitchDelta: { mode: "cubic", points: [] },
        database: emptyDb(), dictionary: "", voice: emptyVoice(),
        pitchTakes: { ...takes }, timbreTakes: { ...takes },
      },
      groups: [],
    })
  })
  return {
    version: 153,
    time: { meter, tempo: [{ position: 0, bpm }] },
    library: [],
    tracks,
    renderConfig: { destination: "", filename: "未命名", numChannels: 1, aspirationFormat: "noAspiration", bitDepth: 16, sampleRate: 44100, exportMixDown: true, exportPitch: false },
  }
}

// ---- emit ---- ---------------------------------------------------------
function writeSVP(obj, fname) {
  const out = path.join(opts.outdir, fname)
  fs.writeFileSync(out, JSON.stringify(obj, null, 1))
  return out
}

const res = []
if (opts.sv2) res.push(writeSVP(buildSV2(), `${opts.prefix}_SV2.svp`))
if (opts.sv1) res.push(writeSVP(buildSV1(), `${opts.prefix}_SV1.svp`))
console.log("BPM:", bpm, "| PPQ:", PPQ, "| SV.QUARTER/PPQ =", BPM_FACTOR, "| tracks:", trackNotesFold.length, "| total notes:", trackNotesFold.reduce((s, t) => s + t.notes.length, 0))
res.forEach(p => console.log("wrote:", p))
