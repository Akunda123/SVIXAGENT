'use strict'
// One geometry owner, in DIP. Movement is event-driven from an immutable origin;
// no cursor polling, accumulated deltas, animation or delayed movement queue.
const DEFAULT_CHAT_SIZE = { width: 372, height: 512 }
const EDGES = new Set(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'])
const valid = (v) => Number.isFinite(v) && Math.abs(v) <= 100000
function chatSize(value = {}) {
  return { width: valid(value.width) ? Math.max(372, Math.min(2000, Math.round(value.width))) : 372,
    height: valid(value.height) ? Math.max(360, Math.min(2000, Math.round(value.height))) : 512 }
}
function resizeBounds(start, edge, dx, dy, area) {
  let { x, y, width, height } = start
  const right = x + width, bottom = y + height
  const minW = Math.min(372, area.width), minH = Math.min(360, area.height)
  if (edge.includes('w')) { x = Math.max(area.x, right - 2000, Math.min(x + dx, right - minW)); width = right - x }
  if (edge.includes('e')) width = Math.max(minW, Math.min(2000, width + dx, area.x + area.width - x))
  if (edge.includes('n')) { y = Math.max(area.y, bottom - 2000, Math.min(y + dy, bottom - minH)); height = bottom - y }
  if (edge.includes('s')) height = Math.max(minH, Math.min(2000, height + dy, area.y + area.height - y))
  return { x, y, width: Math.round(width), height: Math.round(height) }
}
function createOrbWindowController({ getWindow, cursor, workArea, readPrefs = () => ({}), writePrefs = () => {}, notify = () => {} }) {
  let saved
  try { saved = chatSize(readPrefs()) } catch { saved = { ...DEFAULT_CHAT_SIZE } }
  let gesture = null, open = false
  const win = () => { const w = getWindow(); return w && !w.isDestroyed() ? w : null }
  const allowed = (event) => !!win() && event?.sender === win().webContents
  const emit = () => notify({ chatSize: { ...saved }, bounds: win()?.getBounds() })
  function stop(id) {
    if (!gesture || id !== undefined && gesture.id !== id) return
    const wasResize = gesture.kind === 'resize'; gesture = null
    if (wasResize && win()) {
      saved = chatSize(win().getBounds())
      try { writePrefs(saved) } catch { /* Resizing remains usable when preferences are read-only. */ }
      emit()
    }
  }
  function begin(event, id, kind, edge) {
    if (!allowed(event) || !Number.isSafeInteger(id) || id < 1 || kind === 'resize' && (!open || !EDGES.has(edge))) return false
    stop(); gesture = { id, kind, edge, point: cursor(), bounds: win().getBounds() }
    win().setIgnoreMouseEvents(false)
    return true
  }
  function move(event, id) {
    if (!allowed(event) || !gesture || gesture.id !== id) return
    const w = win(), p = cursor(), g = gesture
    const dx = p.x - g.point.x, dy = p.y - g.point.y
    if (!valid(dx) || !valid(dy)) return stop(id)
    const area = workArea(g.kind === 'move' ? p : { x: g.bounds.x + g.bounds.width / 2, y: g.bounds.y + g.bounds.height / 2 })
    if (g.kind === 'resize') {
      const next = resizeBounds(g.bounds, g.edge, dx, dy, area)
      const current = w.getBounds()
      if (Object.keys(next).some((key) => next[key] !== current[key])) w.setBounds(next, false)
    } else if (Math.hypot(dx, dy) >= 4) {
      const x = Math.round(Math.max(area.x, Math.min(g.bounds.x + dx, area.x + area.width - g.bounds.width)))
      const y = Math.round(Math.max(area.y, Math.min(g.bounds.y + dy, area.y + area.height - g.bounds.height)))
      const current = w.getBounds()
      if (x !== current.x || y !== current.y) w.setPosition(x, y, false)
    }
  }
  function layout(event, width, height, panelOpen) {
    if (!allowed(event) || gesture || !valid(width) || !valid(height)) return
    const w = win(), b = w.getBounds()
    open = !!panelOpen
    const area = workArea({ x: b.x + b.width - 32, y: b.y + b.height - 32 })
    width = Math.max(64, Math.min(Math.round(width), area.width)); height = Math.max(64, Math.min(Math.round(height), area.height))
    if (width === b.width && height === b.height) return
    w.setBounds({ x: Math.max(area.x, Math.min(b.x + b.width - width, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(b.y + b.height - height, area.y + area.height - height)), width, height }, false)
  }
  function keyboard(event, edge, dx, dy) {
    if (!allowed(event) || !open || gesture || !EDGES.has(edge) || !valid(dx) || !valid(dy) || Math.abs(dx) > 100 || Math.abs(dy) > 100) return
    const b = win().getBounds(), area = workArea({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
    win().setBounds(resizeBounds(b, edge, dx, dy, area), false)
    saved = chatSize(win().getBounds()); try { writePrefs(saved) } catch {}
    emit()
  }
  function register(ipc) {
    ipc.on('akdagent-drag-start', (e, id) => begin(e, id, 'move'))
    ipc.on('akdagent-drag-move', move)
    ipc.on('akdagent-drag-end', (e, id) => { if (allowed(e)) stop(id) })
    ipc.on('akdagent-window-resize-start', (e, id, edge) => begin(e, id, 'resize', edge))
    ipc.on('akdagent-window-resize-move', move)
    ipc.on('akdagent-window-resize-end', (e, id) => { if (allowed(e)) stop(id) })
    ipc.on('akdagent-window-resize-key', keyboard)
    ipc.on('akdagent-resize', layout)
    ipc.on('akdagent-set-ignore', (e, ignore) => { if (allowed(e)) win().setIgnoreMouseEvents(gesture ? false : !!ignore, { forward: true }) })
  }
  return { register, stop, emit, isActive: () => !!gesture, getChatSize: () => ({ ...saved }) }
}
module.exports = { DEFAULT_CHAT_SIZE, chatSize, resizeBounds, createOrbWindowController }
