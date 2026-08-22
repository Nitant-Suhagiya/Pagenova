---
name: Glass claymorphism
typography:
  primary: "Noto Sans, Segoe UI, system-ui"
themeDefault: dark
accent: orange
---

## Overview

Pagenova combines glass blur with clay-like depth. Dark mode is the default;
light mode uses the same soft, raised surfaces rather than a flat inversion.

## Foundations

- **Typography:** Noto Sans, with Segoe UI and system fonts as fallbacks.
- **Surfaces:** near-black in dark mode and translucent white in light mode.
  Cards, controls, and message bubbles are generously rounded.
- **Depth:** layered outer shadows plus light and dark inset shadows create the
  clay effect. `backdrop-filter` adds the glass finish to controls.
- **Accent:** orange is reserved for active, checked, focused, and primary
  states. White supplies the main highlights in dark mode.
- **Controls:** checkboxes, range inputs, selects, buttons, and text inputs use
  the same rounded, raised treatment. Disabled states remain clearly distinct.

## Accessibility

Keep visible keyboard focus, adequate text contrast in both themes, semantic
controls, and readable labels. Do not use colour alone to communicate state.
