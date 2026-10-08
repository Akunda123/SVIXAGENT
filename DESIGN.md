---
version: alpha
name: AKDAgent Settings
description: Quiet dark desktop controls for virtual singer workflows
colors:
  primary: "#79D825"
  background: "#2E2E2E"
  surface: "#353837"
  text: "#C8C8C8"
  body: "#B3B3B3"
  muted: "#8C8C8C"
  danger: "#E5484D"
  error-text: "#FFB3B6"
  scrollbar: "#606060"
typography:
  sans:
    fontFamily: "system-ui, sans-serif"
  mono:
    fontFamily: "ui-monospace, monospace"
rounded:
  DEFAULT: "8px"
  lg: "10px"
spacing:
  page-padding: "20px"
  section-gap: "14px"
components:
  button: {}
  input: {}
  section: {}
  badge: {}
  dialog: {}
---

# AKDAgent Settings

## Overview
Creative North Star: the existing dark studio control panel, not a promotional website. Global desktop musicians need dependable settings next to a DAW. The network page preserves upstream green accents, compact controls and tonal sections. Its useful signature is a persistent saved-versus-active route readout. No decorative hero, new icon system or rebrand.

Product register; Windows is locally tested. Languages: Simplified/Traditional Chinese, English, Japanese. The repository i18n README owns terminology and fallback. Japanese translations need native review before public release; no Japan-specific business-policy inference from locale.

## Colors
Runtime canonical owner: settings.html :root; this file mirrors those values (Model B). Borders remain translucent white at 8%, hover at 10%, selected at green 15%. Green signals selected/applied, red indicates errors with text, never color alone. Dark theme only; forced-colors uses system colors. Do not invent a light theme.

## Typography
System font stack follows upstream; technical endpoint text is monospace and wraps. Default 13px body, 15px headings, 12px support copy. Japanese controls use normal casing, no letter spacing or italics. Mixed-script endpoints keep full selectable text. Native OS font fallback is accepted.

## Layout
148px sidebar; 32px title area; content scrolls independently. Sections use existing 14px vertical gap. Profile fields stack below 620px. Long names/IPv6 wrap; no horizontal page scrolling. Native selects are deliberately retained; OS popup geometry is accepted.

## Elevation & Depth
Existing tonal surfaces and 1px borders, no added shadows or blur. Restart confirmation reuses the application-owned confirmation window.

## Shapes
Controls 8px, sections 10px, existing badges pill-shaped. Focus has a visible green outline. Delete actions are separated from primary save.

## Components
Canonical primitives: settings.html global buttons/inputs/selects/sections/badges and scrollbar tokens; new network CSS controls layout only. Form controller owns draft validation and live feedback, not a second visual system. Form uses novalidate, real labels, described errors and first-invalid focus. Disabled/busy controls remain readable and cannot double-submit. Loading is text, not skeletons. Error feedback remains until the next action. Inline success is announced politely; no toast stack.

Navigation uses semantic buttons. Profile deletion removes a draft only until Save; Discard restores the last acknowledged configuration. Save never restarts. Apply requires a separate confirmation and prevents a running conversation from being interrupted. New UI contains no native alert/confirm/prompt.

## Motion
Preserve upstream 150ms color transitions; no entrance animation. Reduced motion disables transitions. Scrollbars are global, visible, tokenized, use stable gutters and platform forced-color behavior.

## Do's and Don'ts
- Do preserve profile drafts across locale changes and failed tests.
- Do identify both saved and active routes; a successful test is not a successful model request.
- Do keep local SV/DSH traffic outside proxies.
- Don't store proxy credentials or change OS/global environment settings.
- Don't show inherited secret proxy URLs or raw backend errors in UI.

## Verification
Node policy tests, isolated Electron tests and screenshots at 900px/620px in four locales. Review long labels, validation, busy/stale responses, discard, save conflict, restart cancellation and loopback bypass. Audit only this touched slice; legacy screens are not advertised as accessibility-certified.

## Floating chat extension (2026-10-08)
The existing orb.html theme variables remain canonical for chat. Markdown extends
the message surface using those theme colors, the existing translucent code
surface and system/monospace fonts. The existing chat scrollbar colors (96/125
gray) are now global tokens within the orb document, so code and table overflow
inherit the same visible scrollbar; settings.html ownership remains unchanged.
Live/history Markdown share chat-markdown.js. Reduced motion and forced colors
have explicit paths. Native model selects remain OS-owned. No visual rebrand.

Window gestures use orb-window-ui.js (pointer/keyboard state) and orb-window.js
(main-process geometry). Eight 8px edge / 14px corner hit areas use the existing
theme for hover and focus; chat remains a natural flex layout with its own body
scroller. Orb click and drag coexist. App-owned handles deliberately replace
unsupported native transparent-window resizing, without changing OS menu/select
ownership or exposing a Node capability to the page.
