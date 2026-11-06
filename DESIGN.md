# Yieldwise design system

## Product and design intent
Yieldwise helps individuals track income investments such as money-market funds, bonds, and fixed deposits. It makes dates, cash flows, stated terms, and uncertain estimates easy to understand. The memorable idea is: “My investments feel alive and easy to understand.”

## Direction
A Financial Dashboard: a restrained navy navigation rail, a cool light canvas, blue controls and green income states. Keep financial figures aligned, assumptions visible and the hierarchy clear. The public page retains its editorial display face; portfolio headings use the interface family for efficient scanning. Dates, cash flows and investment terms remain the center of the experience.

## Principles
- Put the event history and projection at the center of the experience so users can see what changes estimates.
- Keep principal, estimated value, and projected earnings visually distinct and labeled.
- Treat unknown product terms as uncertainty; show scenario ranges and explain their assumptions.
- Keep the holdings table or list available for direct comparison. Do not force every task through a chart.
- Use color with text labels and shape; color alone never communicates event meaning or financial state.

## Color tokens
- Field / page background (`--paper`): `#F3F6FA`
- Surface: `#FFFFFF`
- Deep ink / primary text (`--ink`): `#14263D`
- Secondary text (`--muted`): `#52647A`
- Divider (`--line`): `#D7E0EB`; input boundaries (`--control-border`): `#7D8DA3`
- Primary action (`--blue`): `#1D4ED8`, hover `#1E40AF`, pressed `#1E3A8A`; white action text
- Selected accent (`--lime`): `#CBEBD9`
- Withdrawal / rate-change attention (`--orange`): `#A04B14`
- Income / positive data (`--green`): `#17694F`; positive surface `#E7F4ED`
- Destructive / error (`--danger`): `#AD3535`; error surface `#FDECEC`
- Sidebar (`--nav-bg`): `#10243A`, text `#F1F6FC`, secondary text `#BECCDC`, active surface `#234871`
- Focus: `#1746C9` on light surfaces and `#9DCEFF` in the sidebar; visible 3px indicators
- Pair every semantic color with a readable label or icon; keep focus indicators visible.

## Typography
- Public hero display: Source Serif 4 via the existing `--serif` token, weights 400–600, loaded from Google Fonts CSS API: `https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;500;600&display=swap`.
- Interface and body: Instrument Sans, weights 400–700, loaded from Google Fonts CSS API: `https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap`.
- Rates, dates, and amounts: IBM Plex Mono, weights 400–600, loaded from Google Fonts CSS API: `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap`.
- Dashboard, profile and form headings use `--heading`, which resolves to Instrument Sans. Interface text uses `--font-body`. The shared `--text-*`, `--weight-*`, `--leading-*` and `--tracking-*` scales replace per-component font constants. Small labels stay at least 12px; inputs remain 16px. Figures retain tabular numerals.
- These families are available through their official font sources; Instrument Sans and IBM Plex use the SIL Open Font License. Keep text readable at small sizes and use tabular numerals for aligned amounts where available.

## Layout and spacing
- Use a hybrid grid: disciplined alignment for navigation, metrics, and holdings; give the projection and timeline a wider, more expressive canvas.
- Use an 8px spacing rhythm. Compact rows and controls may use 4px subdivisions; major sections need clear vertical separation.
- Shared spacing is expressed in rem through `--space-*`. Use `--sidebar-width` and `--sidebar-width-compact` for the navigation reserve, not a spacing-step approximation. `--page-width` controls public-page centering. Keep structural dimensions and breakpoints distinct from visual spacing.
- Radii: 4px / 6px / 10px / 12px through `--radius-*`, with separate round and pill tokens. Reuse `--shadow-surface`, `--shadow-raised` and the existing `--shadow` for surface, elevated and modal layers.
- Keep overlay blur, native-control opacity and stacking order in the shared tokens too. Compact KPI cards stack at the existing 380px breakpoint so monetary figures remain readable.
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
- Keep the active sidebar destination in sync with hash links and browser Back/Forward. Resolve public anchor positions after the landing page mounts when returning from a portfolio or sign-up screen.
- Investment dialogs return keyboard focus to the opening control. Entry tabs use one tab stop, Arrow Left/Right and Home/End, with a labeled tab panel. Interest choices use a fieldset and legend.
- Pin the investment identity column when its table scrolls horizontally. On mobile, show a visible scroll hint and constrain that column so the financial columns remain reachable. Preserve the native table and column header semantics.

## Local profiles
- Visitors without an active profile first see a public, scrollable landing page. Product explanations, estimate assumptions and privacy notes remain accessible without opening a profile.
- Functional calls to action lead to a dedicated Sign up page, with Log in available for an existing local profile. Open the name/email popup only when requested; never interrupt browsing with it automatically.
- Preserve the requested tool through sign up, log in, switching between them, and reloading their URLs. Resume it after selecting the profile and its storage scopes. Provide a Back to website link; browser Back must continue to work.
- Use the public page's editorial hero, capital-event diagram and feature rows without fabricated balances or sample investments. Reuse the approved typography and color tokens. Personal portfolio tools mount only after local profile entry.
- Profile is a full page in the sidebar, not a section below the overview. Preserve keyboard focus on navigation and restore it after popup cancellation.
- State that profiles are stored only in this browser and are not password protected. Do not present local profile selection as authentication or expose developer setup notices in the product.
- Use the shared light surfaces, Instrument Sans utility headings, blue actions and green accents. Keep forms to name and email while the backend is deferred.

## Theme implementation and verification

- One theme source: `:root` in `src/styles.css`. `src/landing.css` consumes the same variables; do not add a second palette, theme provider or styling framework.
- Audited stack: React / React DOM 18.3.1, Vite 5.4.21, TypeScript 5.6.3, React Vite plugin 4.7.0, Lucide 0.468.0. Styles are plain CSS. Existing hash routes, components, storage scopes, calculations and action handlers are retained.
- Supported mode remains light only. `color-scheme: light` keeps native controls consistent even when the operating system prefers dark. There is no dark toggle, dark class or automatic dark palette in this version; do not claim a dark-mode audit passed.
- UI/UX Pro Max's verified `financial-dashboard` style informed navy trust colors, positive/negative semantics, readable financial figures and an audit-friendly table. Its broad generated Enterprise Gateway / OLED result did not fit this product and was not adopted. The React search had no CSS-token-specific match; existing CSS patterns and the skill's accessibility reference guided implementation.
- Run `npm test`, `npm run test:theme`, `npm run typecheck` and `npm run build`. Theme checks enforce body/action/state contrast of at least 4.5:1, focus and input boundaries of at least 3:1, complete token resolution and the absence of component color literals.
- Remaining fixed values are structural: responsive breakpoints, container/control/chart dimensions, SVG coordinates and icon sizes. Dynamic progress transforms continue to reflect application data. The HTML `theme-color` metadata is a literal matching `--nav-bg`, since metadata cannot reference CSS variables. These are not a second palette.
