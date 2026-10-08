;(function (root) {
  'use strict'
  function bind({ orb, label, header, overlay, api, setIgnore, onEnd, toggle, translate }) {
    let active = null, nextId = 0, suppressClick = false
    function finish(event, cancelled = false) {
      if (!active || event?.pointerId !== undefined && event.pointerId !== active.pointerId) return
      const previous = active; active = null
      if (previous.kind === 'move') { api.dragEnd(previous.id); suppressClick = previous.moved || cancelled }
      else api.windowResizeEnd(previous.id)
      if (previous.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId)
      onEnd(previous.kind)
    }
    function begin(event, kind, edge) {
      if (event.button !== 0 || !event.isPrimary || active) return
      if (kind === 'move' && event.target.closest('button,select,input,a') && event.currentTarget !== orb) return
      suppressClick = false
      const target = event.currentTarget
      active = { id: ++nextId, kind, edge, pointerId: event.pointerId, target, x: event.screenX, y: event.screenY, moved: false }
      target.setPointerCapture(event.pointerId)
      setIgnore(false)
      if (kind === 'move') api.dragStart(active.id)
      else api.windowResizeStart(active.id, edge)
      event.preventDefault()
    }
    for (const el of [orb, label, header]) el.addEventListener('pointerdown', (e) => begin(e, 'move'))
    root.addEventListener('pointermove', (e) => {
      if (!active || active.pointerId !== e.pointerId) return
      if (!(e.buttons & 1)) return finish(e, true)
      active.moved ||= Math.hypot(e.screenX - active.x, e.screenY - active.y) >= 4
      if (active.kind === 'resize') api.windowResizeMove(active.id)
      else if (active.moved) api.dragMove(active.id)
    })
    root.addEventListener('pointerup', (e) => finish(e))
    root.addEventListener('pointercancel', (e) => finish(e, true))
    root.addEventListener('lostpointercapture', (e) => finish(e, true))
    root.addEventListener('blur', () => finish(null, true))
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(null, true) })
    orb.addEventListener('click', (e) => { if (suppressClick && e.detail !== 0) { suppressClick = false; return } toggle() })
    const directions = { n: '↑', ne: '↗', e: '→', se: '↘', s: '↓', sw: '↙', w: '←', nw: '↖' }
    const handles = []
    for (const [edge, arrow] of Object.entries(directions)) {
      const handle = document.createElement('button')
      handle.type = 'button'; handle.className = 'chat-resize-handle edge-' + edge; handle.dataset.edge = edge
      overlay.append(handle); handles.push([handle, arrow])
      handle.addEventListener('pointerdown', (e) => begin(e, 'resize', edge))
      handle.addEventListener('keydown', (e) => {
        if (e.isComposing || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return
        e.preventDefault(); const step = e.shiftKey ? 30 : 10
        api.windowResizeKey(edge, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
      })
    }
    function localize() {
      for (const [handle, arrow] of handles) { const text = translate('ux.window.resize', arrow); handle.title = text; handle.setAttribute('aria-label', text) }
      const text = translate('ux.window.orb'); orb.title = text; orb.setAttribute('aria-label', text)
    }
    localize()
    return { isActive: () => !!active, localize, cancel: () => finish(null, true) }
  }
  root.AKDWindowGestures = { bind }
})(globalThis)
