# Yieldwise design system

## Product and design intent
Yieldwise helps individuals track income investments such as money-market funds, bonds, and fixed deposits. It makes dates, cash flows, stated terms, and uncertain estimates easy to understand. The memorable idea is: “My investments feel alive and easy to understand.”

## Direction
A market field instrument: a clear, active interface for reading time, cash flows, and investment terms. Use a bright, calm canvas with expressive event color and visible numerical hierarchy. Keep the experience trustworthy and avoid trading-terminal tropes.

## Principles
- Put the event history and projection at the center of the experience so users can see what changes estimates.
- Keep principal, estimated value, and projected earnings visually distinct and labeled.
- Treat unknown product terms as uncertainty; show scenario ranges and explain their assumptions.
- Keep the holdings table or list available for direct comparison. Do not force every task through a chart.
- Use color with text labels and shape; color alone never communicates event meaning or financial state.

## Color tokens
- Field / page background: `#F4F7F5`
- Surface: `#FFFFFF`
- Deep ink / primary text: `#17332F`
- Secondary text: `#71817D`
- Divider: `#DCE5E0`
- Cobalt / primary action and active control: `#3159F5`
- Citrus / selected horizon and positive movement: `#C7ED58`
- Persimmon / withdrawal, rate-change, and attention event: `#E56A45`
- Income / active positive data: `#28755D`
- Pair every semantic color with a readable label or icon; keep focus indicators visible.

## Typography
- Display and section headings: Source Serif 4, weights 400–600, loaded from Google Fonts CSS API: `https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;500;600&display=swap`.
- Interface and body: Instrument Sans, weights 400–700, loaded from Google Fonts CSS API: `https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap`.
- Rates, dates, and amounts: IBM Plex Mono, weights 400–600, loaded from Google Fonts CSS API: `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap`.
- These families are available through their official font sources; Instrument Sans and IBM Plex use the SIL Open Font License. Keep text readable at small sizes and use tabular numerals for aligned amounts where available.

## Layout and spacing
- Use a hybrid grid: disciplined alignment for navigation, metrics, and holdings; give the projection and timeline a wider, more expressive canvas.
- Use an 8px spacing rhythm. Compact rows and controls may use 4px subdivisions; major sections need clear vertical separation.
- Prefer a few purposeful surfaces over a stack of rounded cards. Use flat surfaces, restrained borders, and limited shadows.
- Desktop: keep the projection and event timeline prominent, with a nearby per-investment breakdown and a scan-friendly holdings table.
- Mobile: let the projection remain readable, keep horizon controls and event details reachable, and preserve table semantics with a real table or an accessible equivalent.

## Interaction and motion
- Projection horizon controls update selected date and estimated values in place.
- Event markers reveal the date, type, amount or rate, and how the event affects later estimates.
- Charts provide a readable date/value tooltip on hover and keyboard focus; provide an accessible textual summary.
- Use short, functional transitions for selection, panels, and chart updates. Honor `prefers-reduced-motion`.
- Any drag or scrub interaction must also work with keyboard controls and visible buttons.

## Accessibility and financial clarity
- Use semantic landmarks, headings, table headers, explicit form labels, visible focus states, and sufficient contrast.
- Pair colors with words/icons; announce dynamic estimate updates accessibly.
- State the projection horizon and assumptions near the numbers. Never imply estimates are guaranteed or constitute financial advice.

## Research and evidence
- Product patterns reviewed via search: [Wealthfolio](https://wealthfolio.app/), [Fidelity fixed-income analysis](https://www.fidelity.com/fixed-income-bonds/fixed-income-tools-services/fixed-income-analysis-tool), and [Empower tools](https://www.empower.com/tools).
- Their pages could not be visually inspected because the available headless browser lacked Chromium. These references informed hierarchy and product patterns only; no screenshot-based claims are made.
- Design preview: `yieldwise-preview.html` in the saved design exploration. The image-generation preview path was unavailable because no generation key is configured.


## Navigation
- Use a persistent left sidebar on desktop for Overview, Investments and How estimates work. Provide Profile as a dedicated sidebar destination and keep Switch profile and local storage status at the bottom.
- On screens at or below 760px, use a compact brand header with a Menu disclosure. Expanded navigation stays in normal document flow. Selecting a destination closes the menu and focuses the destination; Escape closes the menu and returns focus to its toggle.
- Active navigation uses the cobalt surface treatment with a visible location indicator. Honor reduced motion when scrolling between sections.

## Local profiles
- New visitors see a dedicated profile-creation page. Returning visitors without an active tab session get a name/email popup.
- Profile is a full page in the sidebar, not a section below the overview. Preserve keyboard focus on navigation and restore it after popup cancellation.
- State that profiles are stored only in this browser and are not password protected. Do not present local profile selection as authentication or expose developer setup notices in the product.
- Use the existing light surfaces, serif headings, cobalt actions and green/citrus initials. Keep forms to name and email while the backend is deferred.
