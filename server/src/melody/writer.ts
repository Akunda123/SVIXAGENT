// 把生成的旋律音符写成 MIDI 文件数据（结构符合 midi-file.writeMidi 输入）。
// ppq(ticks per beat) 默认 480；拍 → tick = beat * ppq。
// midi-file 的类型定义较严格，这里用宽松类型构造事件。

import { MelodyNote } from "./generator.js";
import { writeMidi } from "midi-file";

export interface WriteMidiOpts {
  bpm?: number;       // 默认 120
  ppq?: number;       // 默认 480
  program?: number;   // GM instrument 号（主旋律，默认 0 钢琴）
  trackName?: string;
  chordProgram?: number; // 伴奏琶音 GM 号（默认 40 violin）
}

type MidiEvent = any;
type MidiData = any;

const tick = (beat: number, ppq: number) => Math.round(beat * ppq);

export function toMidiData(notes: MelodyNote[], opts: WriteMidiOpts): MidiData {
  const { bpm = 120, ppq = 480, program = 0, trackName = "Melody", chordProgram = 40 } = opts;

  const melodyNotes = notes.filter(n => n.vel >= 0.5);
  const accompNotes = notes.filter(n => n.vel < 0.5);

  function buildTrack(ns: MelodyNote[], ch: number, prog: number, label: string): MidiEvent[] {
    const evts: MidiEvent[] = [];
    evts.push({ absoluteTime: 0, deltaTime: 0, meta: true, text: label, type: "trackName" });
    evts.push({ absoluteTime: 0, deltaTime: 0, channel: ch, programNumber: prog, type: "programChange" });
    for (const n of ns) {
      const velv = Math.max(1, Math.round(n.vel * 127));
      evts.push({ absoluteTime: tick(n.startBeat, ppq), deltaTime: 0, channel: ch, noteNumber: n.pitch, velocity: velv, type: "noteOn" });
      evts.push({ absoluteTime: tick(n.startBeat + n.durBeats, ppq), deltaTime: 0, channel: ch, noteNumber: n.pitch, velocity: 0, type: "noteOff" });
    }
    evts.sort((a, b) => (a.absoluteTime || 0) - (b.absoluteTime || 0));
    let last = 0;
    for (const e of evts) {
      e.deltaTime = (e.absoluteTime || 0) - last;
      last = e.absoluteTime || 0;
      delete e.absoluteTime;
    }
    evts.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    return evts;
  }

  const melodyTrack = buildTrack(melodyNotes, 0, program, trackName);
  const accompTrack = accompNotes.length ? buildTrack(accompNotes, 1, chordProgram, trackName + " accomp") : null;

  const header = { format: 1, numTracks: accompTrack ? 3 : 2, ticksPerBeat: ppq };

  // 头轨：tempo
  const headerTrack: MidiEvent[] = [];
  headerTrack.push({ absoluteTime: 0, deltaTime: 0, meta: true, text: trackName, type: "trackName" });
  headerTrack.push({ absoluteTime: 0, deltaTime: 0, meta: true, microsecondsPerBeat: Math.floor(60000000 / bpm), type: "setTempo" });
  headerTrack.sort((a, b) => (a.absoluteTime || 0) - (b.absoluteTime || 0));
  let hlast = 0;
  for (const e of headerTrack) {
    e.deltaTime = (e.absoluteTime || 0) - hlast;
    hlast = e.absoluteTime || 0;
    delete e.absoluteTime;
  }
  headerTrack.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  const tracks = accompTrack ? [headerTrack, melodyTrack, accompTrack] : [headerTrack, melodyTrack];
  return { header, tracks };
}

export function toMidiBytes(notes: MelodyNote[], opts: WriteMidiOpts = {}): Uint8Array {
  const data = toMidiData(notes, opts);
  const arr = writeMidi(data);
  return new Uint8Array(arr);
}
