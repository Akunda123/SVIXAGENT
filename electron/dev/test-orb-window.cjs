'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { createOrbWindowController, resizeBounds, chatSize } = require('../src/orb-window')
const area = { x: 0, y: 0, width: 1920, height: 1080 }
function fixture(prefs) {
  let bounds = { x: 1000, y: 400, width: 372, height: 512 }, point = { x: 1100, y: 500 }, moves = 0, written
  const handlers = new Map(), sender = {}, event = { sender }
  const w = { webContents: sender, isDestroyed: () => false, getBounds: () => ({ ...bounds }), setIgnoreMouseEvents() {},
    setBounds: (b) => { bounds = { ...b }; moves++ }, setPosition: (x, y) => { bounds = { ...bounds, x, y }; moves++ } }
  const controller = createOrbWindowController({ getWindow: () => w, cursor: () => point, workArea: () => area,
    readPrefs: () => prefs || {}, writePrefs: (value) => { written = value } })
  controller.register({ on: (name, fn) => handlers.set(name, fn) })
  const call = (name, ...args) => handlers.get('akdagent-' + name)(event, ...args)
  call('resize', 372, 512, true)
  return { controller, call, handlers, w, event, get bounds() { return bounds }, get moves() { return moves }, get written() { return written }, point: (x, y) => { point = { x, y } } }
}
test('absolute drag, idle stability, release and stale moves', () => {
  const f = fixture(); f.call('drag-start', 1)
  f.point(1140, 520); f.call('drag-move', 1)
  assert.deepEqual(f.bounds, { x: 1040, y: 420, width: 372, height: 512 })
  for (let i = 0; i < 10000; i++) f.call('drag-move', 1)
  assert.equal(f.moves, 1, 'stationary cursor never adds drift')
  f.call('drag-end', 1); f.point(1200, 600); f.call('drag-move', 1)
  assert.equal(f.moves, 1); assert.equal(f.controller.isActive(), false)
})
test('foreign senders, invalid numbers and superseded gestures cannot move the orb', () => {
  const f = fixture(); f.handlers.get('akdagent-drag-start')({ sender: {} }, 1)
  assert.equal(f.controller.isActive(), false)
  f.call('drag-start', NaN); assert.equal(f.controller.isActive(), false)
  f.call('drag-start', 1); f.call('drag-start', 2); f.point(1120, 520)
  f.call('drag-end', 1); f.call('drag-move', 1); assert.equal(f.moves, 0)
  f.call('drag-move', 2); assert.equal(f.moves, 1)
  f.call('resize', Infinity, NaN, true); assert.ok(Number.isFinite(f.bounds.x))
})
test('hover layout is frozen while dragging and right-click-sized jitter is a click', () => {
  const f = fixture(); f.call('drag-start', 1); f.call('resize', 190, 64, false)
  assert.equal(f.bounds.width, 372)
  f.point(1102, 501); f.call('drag-move', 1); assert.equal(f.moves, 0)
  f.controller.stop(); assert.equal(f.controller.isActive(), false)
})
test('eight resize directions preserve the opposite edge and clamp minimum/work area', () => {
  const b = { x: 500, y: 400, width: 600, height: 500 }
  for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const next = resizeBounds(b, edge, 40, 30, area)
    if (edge.includes('w')) assert.equal(next.x + next.width, b.x + b.width)
    if (edge.includes('n')) assert.equal(next.y + next.height, b.y + b.height)
    assert.ok(next.width >= 372 && next.height >= 360)
  }
  assert.equal(resizeBounds(b, 'nw', 10000, 10000, area).width, 372)
  const maximum = resizeBounds(b, 'se', 10000, 10000, area)
  assert.equal(maximum.x + maximum.width, 1920); assert.equal(maximum.y + maximum.height, 1080)
})
test('resizing persists only at release; collapse/reopen keeps custom size', () => {
  const f = fixture(); f.call('window-resize-start', 1, 'nw'); f.point(1050, 450); f.call('window-resize-move', 1)
  assert.equal(f.written, undefined)
  f.call('window-resize-end', 1); assert.deepEqual(f.written, { width: 422, height: 562 })
  const anchor = { x: f.bounds.x + f.bounds.width, y: f.bounds.y + f.bounds.height }
  f.call('resize', 64, 64, false); f.call('resize', 422, 562, true)
  assert.equal(f.bounds.x + f.bounds.width, anchor.x); assert.equal(f.bounds.y + f.bounds.height, anchor.y)
  assert.deepEqual(fixture(f.written).controller.getChatSize(), f.written)
})
test('keyboard resize, lifecycle cancellation, corrupt preferences and small monitors', () => {
  const f = fixture(); f.call('window-resize-key', 'e', 10, 0); assert.equal(f.written.width, 382)
  f.call('window-resize-start', 3, 'se'); f.controller.stop(); f.point(1400, 900); f.call('window-resize-move', 3)
  assert.equal(f.bounds.width, 382)
  assert.deepEqual(chatSize({ width: NaN, height: Infinity }), { width: 372, height: 512 })
  const b = resizeBounds({ x: -1000, y: -200, width: 250, height: 250 }, 'se', -500, -500, { x: -1000, y: -200, width: 300, height: 280 })
  assert.ok(b.width > 0 && b.width <= 300 && b.height > 0 && b.height <= 280)
})
