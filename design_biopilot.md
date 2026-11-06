---
version: alpha
name: Lixai Studio
description: A dark, editorial studio system with warm cream text, a gold accent, and refined serif contrast.
colors:
  primary: "#f5f1e8"
  secondary: "#d4a017"
  tertiary: "#12100d"
  neutral: "#374151"
  surface: "#1a1713"
  on-surface: "#f5f1e8"
  background: "#12100d"
  text: "#f5f1e8"
  accent: "#d4a017"
  border: "#374151"
  shadow: "#4a4337"
  error: "#d64545"
typography:
  headline-display:
    fontFamily: "Geist Variable"
    fontSize: "104px"
    fontWeight: 500
    lineHeight: "125px"
    letterSpacing: "-4.68px"
  headline-lg:
    fontFamily: "Geist Variable"
    fontSize: "67px"
    fontWeight: 500
    lineHeight: "80px"
    letterSpacing: "-1.56px"
  headline-md:
    fontFamily: "Geist Variable"
    fontSize: "43px"
    fontWeight: 500
    lineHeight: "80px"
    letterSpacing: "-3.52px"
  headline-sm:
    fontFamily: "Geist Variable"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: "34px"
    letterSpacing: "0px"
  body-lg:
    fontFamily: "Geist Variable"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "25.2px"
    letterSpacing: "-0.16px"
  body-md:
    fontFamily: "Geist Variable"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "-0.08px"
  body-sm:
    fontFamily: "Geist Variable"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0px"
  label-lg:
    fontFamily: "Geist Variable"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
    letterSpacing: "0px"
  label-md:
    fontFamily: "Geist Variable"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "0px"
  label-sm:
    fontFamily: "Geist Variable"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.02em"
  label-caps:
    fontFamily: "Geist Variable"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.08em"
  serif-display:
    fontFamily: "Instrument Serif"
    fontSize: "72px"
    fontWeight: 400
    lineHeight: "80px"
    letterSpacing: "0px"
  serif-italic:
    fontFamily: "Instrument Serif"
    fontSize: "72px"
    fontWeight: 400
    lineHeight: "80px"
    letterSpacing: "0px"
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "20px"
  full: "9999px"
spacing:
  xs: "12px"
  sm: "20px"
  md: "32px"
  lg: "80px"
  xl: "114px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    padding: "18px 24px"
    height: "52px"
    width: "225px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    padding: "18px 24px"
    height: "52px"
    width: "225px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "0px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: "14px 16px"
---

# Lixai Studio

## Overview
Lixai Studio feels like a dark editorial landing page for an AI-native product studio: polished, confident, and slightly cinematic. The experience is spacious rather than dense, with large typography, generous breathing room, and a restrained interface that lets the brand message and hero illustration lead. The tone balances technical credibility with creative warmth through the mix of geometric sans-serif and elegant serif styling.

## Colors
- **Background (#12100d):** A near-black espresso tone that establishes the page’s moody, premium atmosphere and supports strong contrast for the cream foreground text.
- **Primary (#f5f1e8):** A warm off-white used for main text, primary buttons, and high-contrast UI surfaces. It reads softer than pure white and reinforces the refined editorial feel.
- **Secondary (#d4a017):** A golden accent used sparingly for emphasis, the italic display word in the hero, and subtle glow moments. It adds energy without breaking the dark palette.
- **Tertiary (#12100d):** The deepest ink tone, useful for text on light buttons and for grounding components that need to disappear into the background.
- **Surface (#1a1713):** A slightly lifted dark surface for panels, cards, or overlays when separation from the background is needed without introducing a bright container.
- **On-surface (#f5f1e8):** The default foreground color for content placed on dark surfaces.
- **Neutral (#374151):** A muted gray border tone used for low-contrast dividers and card edges.
- **Border (#374151):** The same restrained gray seen in the card outline, suited to subtle structural definition.
- **Shadow (#4a4337):** A warm shadow hue that feels organic against the background and supports the soft glow treatment.
- **Error (#d64545):** A clear red for validation and destructive states; it should remain visually separate from the gold accent.

## Typography
The system is led by **Geist Variable**, used for all primary navigation, headings, body copy, and buttons. Headings rely on medium weight with very tight negative tracking, giving the brand a compact, engineered editorial look even at large sizes. Body text stays readable and calm with lighter weight and slightly relaxed leading, while labels and buttons use 500 weight for clarity and emphasis.

The alternate display voice is **Instrument Serif**, used for the italic hero wordmark-style emphasis. This serif treatment creates the strongest expressive contrast in the system and should be reserved for short, high-impact phrases rather than long-form reading. Uppercase is not a major visual convention in the screenshot; emphasis comes more from scale, weight, and the serif/sans contrast than from caps-lock styling.

## Layout
The page uses a wide, centered hero structure with a strong left text column and a right-side visual anchor. Spacing is expansive and rhythmic, moving through the scale of `12px`, `20px`, `32px`, `80px`, and `114px`, which creates a sense of measured openness rather than tight modular density. Navigation, hero content, and calls to action all feel aligned to an invisible large-container grid with ample side margins.

Section padding should stay generous, especially around hero compositions and promotional blocks. Smaller UI clusters, such as nav items and button groups, can use the tighter end of the spacing scale, but the overall system should avoid crowded arrangements. Cards and secondary containers should use modest inner padding and preserve the page’s airiness.

## Elevation & Depth
The system is mostly flat, with hierarchy created through contrast, scale, and tonal layering rather than heavy raised surfaces. The one notable depth cue is a subtle warm glow around the hero illustration, supported by the accent color and soft shadow treatment. Borders are understated and thin, used more for definition than for dramatic separation.

Because the background is so dark, depth should come from value shifts: slightly lighter surfaces, cream text, and gold highlights. Avoid complex shadows on cards or controls unless they are needed to imply focus or hover state. The overall depth language should feel quiet, premium, and controlled.

## Shapes
The shape language is soft and highly rounded for interactive elements, especially pill buttons with `rounded.full`. Cards are more restrained, using `rounded.sm` for a subtle, architectural corner radius. Overall, the system feels smooth and approachable rather than sharp or angular, with roundness used to soften the otherwise dark, high-contrast composition.

## Components
**Buttons:** Primary buttons use `button-primary` and should appear as cream pills with dark text, medium weight, and generous horizontal padding. Secondary buttons use `button-secondary` for accent-filled actions with gold background and cream text. Link-style actions use `button-link` and should remain minimal, underlined, and text-only. Keep button heights consistent at `52px`, and preserve the wide `225px` minimum width for hero-style CTAs. Hover states should feel subtle; prefer slight tonal shifts or opacity changes over movement-heavy effects.

**Cards:** Use `card` for darker containers that need a thin border and modest padding. Cards should remain visually quiet, with no pronounced shadow and only enough contrast to define content boundaries.

**Inputs:** Inputs should follow the same soft-pill rounding as buttons, with dark or surface-based backgrounds, cream text, and restrained padding. Focus states should be visible through border or outline contrast rather than glow-heavy effects.

**Navigation and links:** Nav items are lightweight, text-first, and uncluttered. Active or hovered links may use the gold accent, but the default nav should remain cream-on-dark for consistency.

**Illustrative and decorative elements:** The hero artwork and ambient accent glow are important brand signatures. Treat these as supporting visuals, not interface chrome, and keep them visually integrated with the dark background.

## Do's and Don'ts
- Do keep the interface spacious and editorial, with generous breathing room around major content blocks.
- Do use cream text on the dark background for most foreground content to preserve the page’s high-contrast elegance.
- Do reserve the gold accent for emphasis, key actions, and expressive moments like highlighted words or glows.
- Do keep buttons pill-shaped and consistent in height and padding across the system.
- Don't introduce bright, saturated surface colors that compete with the gold accent or break the dark mood.
- Don't overuse shadows, gradients, or layered elevation; the system should feel mostly flat and refined.
- Don't rely on uppercase styling or heavy letter spacing for hierarchy; use size, weight, and contrast instead.
- Don't make cards or inputs too rounded if they need to feel structural; reserve the fullest radius for buttons and key CTAs.