---
name: Claymorphism
colors:
  primary: "#3B82F6"
  secondary: "#FFFFFF"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  surface: "#FFFFFF"
  text: "#1C398E"
  neutral: "#FFFFFF"
typography:
  h1:
    fontFamily: "Poppins"
    fontSize: 3rem
  body-md:
    fontFamily: "Montserrat"
    fontSize: 1rem
  label-caps:
    fontFamily: "JetBrains Mono"
    fontSize: 0.75rem
  weights: "100, 200, 300, 400, 500, 600, 700, 800, 900"
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 4px
  md: 8px
  sourceScale: "4/8/12/16/24/32"
---

## Overview

Pagenova uses soft, rounded surfaces with enough depth to feel tactile without
making controls hard to read.

## Style foundations

- **Visual style:** high contrast, rounded, and restrained
- **Typography scale:** expressive on desktop and compact in the side panel
- **Typography fonts:** primary=Montserrat, display=Poppins, mono=JetBrains Mono
- **Typography weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- **Spacing scale:** 4/8/12/16/24/32

## Claymorphism signature

The clay effect comes from two soft shadow layers, not from thick borders:

1. **Outer drop shadow:** a large, low-opacity ambient shadow lifts the shape
   off the page.
2. **Inner top highlight:** a light inset at the top edge simulates a raised,
   clay-like lip catching light.
3. **Inner bottom shade:** a soft dark inset at the bottom edge gives the
   shape rounded, tactile depth.
4. **Generous corner radius:** rounded cards, buttons, and inputs (16px or more
   on surfaces, 12px or more on controls).

Keep hover, focus-visible, active, and disabled states distinct. Use semantic
tokens rather than raw values and keep the existing palette. Depth should come
from shadow and radius, not added color.

## Accessibility

WCAG 2.2 AA, keyboard-first interactions, visible focus states.
