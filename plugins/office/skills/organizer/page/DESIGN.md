---
version: alpha
name: Dashboard default
description: The dashboard's default look. Quiet blue-grey canvas, white cards, one teal accent; IBM Plex Sans for text, IBM Plex Mono for code. Dark values are the `-dark` keys.
colors:
  background: "#f5f7f8"
  background-dark: "#12181b"
  surface: "#ffffff"
  surface-dark: "#1a2226"
  on-surface: "#1c2529"
  on-surface-dark: "#e3eaec"
  muted: "#5b6a71"
  muted-dark: "#94a5ab"
  hairline: "#d9e1e4"
  hairline-dark: "#2c393e"
  primary: "#0f6b74"
  primary-dark: "#5cc0c9"
  on-primary: "#ffffff"
  on-primary-dark: "#1a2226"
  primary-container: "#e2f0f1"
  primary-container-dark: "#1d3337"
  warning: "#9a5b00"
  warning-dark: "#e0a54a"
  error: "#b42318"
  error-dark: "#f28b82"
  ok: "#2f7a3b"
  ok-dark: "#7cc98a"
  ai: "#6a4fb3"
  ai-dark: "#b6a1f0"
typography:
  headline: { fontFamily: "IBM Plex Sans", fontSize: 22px, fontWeight: 600, lineHeight: 1.25, letterSpacing: -0.01em }
  title: { fontFamily: "IBM Plex Sans", fontSize: 18px, fontWeight: 600, lineHeight: 1.3, letterSpacing: -0.005em }
  body: { fontFamily: "IBM Plex Sans", fontSize: 14px, fontWeight: 400, lineHeight: 1.55, letterSpacing: 0em }
  label: { fontFamily: "IBM Plex Sans", fontSize: 13px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0.005em }
  caption: { fontFamily: "IBM Plex Sans", fontSize: 12px, fontWeight: 500, lineHeight: 1.45, letterSpacing: 0.04em }
  code: { fontFamily: "IBM Plex Mono", fontSize: 12.5px, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0em }
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 48px
---

# Dashboard default

A work tool read many times a day: calm surfaces, one accent, colour kept for meaning (teal for actions, amber for "needs you", red for a failed read or write, green for done, violet for the AI).

## Emphasis

Bold inside body text (card titles, banner leads, table headers, Markdown headings) is weight 600, the title weight, at the body size.

## Elevation

One raised level for cards, chat bubbles and tooltips: a soft two-layer shadow tinted with the ink colour in light (`0 1px 2px rgba(16,40,46,.06), 0 2px 6px rgba(16,40,46,.05)`), plain black and stronger in dark (`0 1px 2px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.25)`).
