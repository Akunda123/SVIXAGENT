#!/usr/bin/env node
/**
 * 一次性：造一个**最小可听的 dynamics 对照工程**（不改用户手上的工程）。
 * 以已保存的样本 ixp 为骨架（保证结构合法），改成：
 *   轨1「未命名音轨」(乐器沿用样本的 Orchestral Piccolo 1)
 *     ├ 音符A  C4 4拍 @0拍   attributes.dynamic=0.5 + **dynamics 曲线（大摆幅：强→弱→强）**
 *     └ 音符B  C4 4拍 @5拍   attributes.dynamic=0.5，**无 dynamics**（对照）
 *   时间轴只留 4/4 + 120 BPM；只留这一条轨/一个组，方便试听。
 * 用法：node tools/make-dyn-test-ixp.cjs
 */
const fs = require('fs')
const path = require('path')
const { DOCUMENTS } = require('./lib-paths.cjs')

const SCORES = path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores')
const SRC = path.join(SCORES, 'ixp测试.ixp')
const OUT = path.join(SCORES, 'dyn测试.ixp')
const Q = 705600000

const o = JSON.parse(fs.readFileSync(SRC, 'utf8').replace(/[\u0000\s]+$/, ''))
const hex16 = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
const DUR = 4 * Q   // 4 拍

// 骨架音符（借样本现有音符的字段形状）
const proto = o.library[0].notes[0]
const mkNote = ({ onset, dynamic, dynCurve }) => {
  const n = {
    uuid: hex16(),
    onset,
    duration: DUR,
    pitch: 60,
    detune: 0,
    attributes: { dynamic, muted: false, articulationsFixed: false },
    takes: { activeTakeId: 0, takes: [{ id: 0, seedPitch: 0, seedTimbre: 0, liked: false }] },
  }
  if (dynCurve) {
    // ⚠️ y 是**相对 attributes.dynamic 的偏移**；x 是**音符内相对 blick**（0 … duration）
    n.dynamics = { mode: 'cubic', points: [0, 0.45, Math.floor(DUR / 2), -0.45, DUR, 0.45] }
  }
  return n
}
void proto

// 只留一个组、两个音符
o.library = [{
  name: 'DYN-对照',
  uuid: hex16().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
  parameters: o.library[0].parameters,     // 沿用 9 通道骨架
  pitchControls: [],
  notes: [
    mkNote({ onset: 0, dynamic: 0.5, dynCurve: true }),      // A：有曲线
    mkNote({ onset: 5 * Q, dynamic: 0.5, dynCurve: false }), // B：无曲线（对照）
  ],
  musicalScale: { type: 'Major', root: 'C' },
}]

// 时间轴：只留 4/4 + 120
o.time = { meter: [{ index: 0, numerator: 4, denominator: 4 }], tempo: [{ position: 0, bpm: 120 }], startTimeSeconds: 0 }

// 只留轨 1，并把组引用指向新组
const track = o.tracks[0]
const libUuid = o.library[0].uuid
track.name = 'DYN测试轨'
track.mainRef.groupID = track.mainRef.uuid || track.mainRef.groupID
track.mainRef.blickOffset = 0
track.mainRef.blickAbsoluteBegin = 0
track.mainRef.blickAbsoluteEnd = 10 * Q
track.groups = [{
  uuid: hex16().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
  groupID: libUuid,
  blickAbsoluteBegin: 0,
  blickAbsoluteEnd: 10 * Q,
  blickOffset: 0,
  pitchOffset: 0,
  mute: false,
  isInstrumental: false,
  voice: {},
  voicePresetName: '',
  takes: { activeTakeId: 0, takes: [{ id: 0, seedPitch: 0, seedTimbre: 0, liked: false }] },
  timestampLMR: 0,
  timestampLRSR: 0,
}]
o.tracks = [track]
o.uuid = hex16().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
o.loopBegin = 0
o.loopEnd = 0
o.loopEnabled = false

fs.writeFileSync(OUT, JSON.stringify(o, null, 2), 'utf8')
console.log('已写出：' + OUT)
console.log('  大小 ' + fs.statSync(OUT).size + ' 字节')
console.log('  组「DYN-对照」2 个音符：A 有 dynamics 曲线 / B 无（均 dynamic=0.5，C4，各 4 拍，B 在 5 拍处）')
console.log('  曲线 points = [0, 0.45, 中点, -0.45, 末点, 0.45]（强→弱→强的大摆幅）')
console.log('  乐器沿用样本：' + (track.mainRef.database && track.mainRef.database.name))
void path
