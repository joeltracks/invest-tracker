# Design implementation guidance

- Follow `DESIGN.md` for Yieldwise visual tokens and interaction patterns.
- Keep investments, event history, estimate assumptions, and uncertainty legible before decorative elements.
- Make timeline and chart interactions keyboard-accessible; support hover and focus tooltips and reduced motion.
- Use semantic labels alongside event colors and state colors.
- Preserve responsive table semantics and do not present projections as guaranteed returns or financial advice.

## Publishing

- After requested code changes, run the relevant checks, then automatically commit and push to `joeltracks/invest-tracker` on `codex/dashboard`, unless the user explicitly asks to keep the work local.
- Preserve other contributors' changes. Do not force-push or merge into `main` without an explicit request.
- Report check failures and deployment status accurately. Keep credentials and local preview/evidence artifacts out of commits.
