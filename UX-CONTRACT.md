# UX Contract — network, subscription and floating chat slice

Scope: HTTP/HTTPS address/port profiles, subscription setup, floating chat and window gestures. This contract documents the changed slice, not a retroactive certification of legacy screens.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | settings.html native select | settings.html CSS / network-schema.js | native OS popup | keyboard / narrow screenshot |
| Form | network-settings-ui.js | network-schema.js | create/edit | novalidate / first invalid / failed save |
| Scrollbar | settings.html global CSS | :root scrollbar tokens | stable gutter | computed style / screenshot |
| Toast | network-feedback live region | network-settings-ui.js | inline feedback instead of toast | locale / stale result / busy |
| CRUD | network-settings-ui.js | network-settings.js / network-settings-ipc.js | stay on page / draft delete | full IPC / cancellation / conflict |

Restart confirmation owner: main.js askConfirm / confirm.html. IPC capability owner: settings-preload.js. Runtime tokens are canonical; DESIGN.md mirrors them.

## Flow ledger

Add/edit/delete modifies draft only; selected deleted profile falls back to original environment mode in the draft. Choosing the startup-default route immediately persists a valid configuration through the same atomic, acknowledged save owner. Invalid data is retained with a correction hint. Profile field edits still require Save; closing Settings does not lose a committed startup choice. Save remains on page and updates saved readout only after acknowledgment. Failed save keeps the draft. Discard restores saved settings and returns focus to the route selector. Test uses the draft without saving; fields can invalidate an old result, no automatic requests. Apply is enabled only for saved pending settings, refuses while busy or disconnected, confirms restart; cancellation does not restart. Invalid startup settings stop startup with an actionable error, never quietly choose a different route.

Model selection owns automatic main-process session binding. It waits for the backend, shows floating chat, reuses the current project segment, and shares one binding flight across concurrent UI requests. No prompt is sent. Success reflects server selection; failure is inline and retryable, not a native alert or false selected default.

Successful host-confirmed OAuth creates/reuses only the exact built-in subscription route and removes its API-key override so stored OAuth is used. Other routes, custom models, endpoints, secrets and defaults remain unchanged. Settings are backed up first. Cancellation/failure creates nothing. The main process observes completion even with Settings closed; both dropdowns refresh from the actual host catalog. A recorded success is not a guarantee of model/account entitlement and never triggers inference.

Assistant Markdown has one safe, bundled offline renderer for live and restored messages. HTML and dangerous URLs are disabled, images render as alt text without remote requests, links open only on user activation through the existing external-link owner. Code/table overflow is local; manual scroll-up survives text chunks. User messages remain literal text.

## Floating window gestures

The orb, label and non-interactive chat header share one pointer-capture gesture
owner. A 4-DIP threshold separates a click from a drag. Geometry is computed from
the initial window/cursor position, never accumulated mouse deltas. There is no
movement timer. Release, cancellation, capture loss, blur, hide and renderer
reload stop the gesture; superseded IDs and foreign-window IPC are ignored.
Hover expansion and click-through changes cannot resize an active gesture.

Chat uses eight app-owned edge/corner handles because native resizing is not
reliable for transparent Electron windows on Windows. Handles show directional
resize cursors, have localized names and support arrow keys (Shift: larger step).
Minimum size and display work-area bounds prevent unusable layouts. The last
completed chat size is saved separately from song/session/model data; closing
and reopening chat or restarting reuses it. Physical mixed-DPI/multi-monitor
dragging remains a separate manual acceptance test.

## Async and safety

Pessimistic writes, revision checking and one mutation per window. Tests have bounded timeout and no model keys/prompts. Late test results are ignored after edits or navigation. Busy state blocks duplicates, not arbitrary editing. Validation focuses the first invalid field; field errors have aria-invalid and describedby. Four-language switching does not reset drafts or leave old result messages untranslated. Keyboard focus is visible; native selects, semantic labels and buttons retained. At narrow sizes fields/actions wrap, scrollbars remain visible.

## Scope / lifecycle

Settings live in application userData/network-settings.json with one recoverable previous-file backup. No OS settings, credentials or music files changed. Default original environment behavior preserves compatibility. Direct explicitly bypasses all proxies; custom HTTP/HTTPS mode bypasses local SV/DSH traffic. Windows system mode supports static HTTP/HTTPS only; PAC/SOCKS is an explicit unsupported error. External browser and Codex networking are separate. New profiles omit authentication intentionally; secrets require a separate secure-storage design.

## Verification

Unit plus actual Electron page/IPC tests, success/failure/conflict/stale/duplicate/keyboard flows and screenshots. Japanese machine-authored strings not native-reviewed; macOS system-proxy support is not claimed. Static audit complements, does not replace runtime evidence.
# Subscription model catalog extension (2026-10-08)

The model page identifies the verification date and distinguishes selectable IDs
from plan entitlements or extra credits. No default or extra-billing mutation.
Owned host preload updates only the in-memory SDK catalog, preserving mixed
protocols and OAuth. Existing custom fields remain; custom endpoints opt out.
Successful pre-restart login is provisioned before the auth bridge resets its
attempt snapshot. No stale or cancelled completion may authorize another route.
