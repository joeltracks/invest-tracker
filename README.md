# Yieldwise dashboard prototype

Responsive React + TypeScript frontend for tracking income investments. This phase uses fictional sample records and browser local storage; no real accounts or backend are connected.

## Run locally

Requires Node.js 20 or later.

```sh
npm install
npm run dev
npm run typecheck
npm run build
```

## Included

- Dashboard totals and 3, 6, 12 and 24 month projections.
- Event ledger for dated deposits, withdrawals and interest rate changes. Open an investment’s edit view or use its ledger action to record events.
- Gross/net yield choice with an optional tax estimate for gross yields; simple to daily-compounded ranges when terms are unknown.
- Scheduled, active, matured and closed states; scheduled and closed records are excluded from totals. Matured investments prompt a renew/update or close decision.
- Live estimates in the add form, templates for Treasury bonds, fixed deposits and MMFs, payout/maturity dates, monthly payout overview, chart tooltips/breakdown, sort/filter, and weighted average yield.
- Statement reconciliation field with the difference from the app estimate.
- Local PDF text extraction with candidate review for multiple detected investments and duplicate warnings. No external AI/OCR is called. Scanned PDFs need manual entry.
- Undo after deletion, CSV export, responsive holdings cards with table roles and labels, validation, keyboard controls, and an empty state.

## Projection assumptions

All calculations use ACT/365 calendar days and accrue separately between ledger events. For each segment, simple interest is `principal × (annual rate / 100) × days / 365`. Compounding uses `balance × ((1 + annual rate / 100 / m)^(m × days / 365) − 1)`, where `m` is the selected compounding frequency. A deposit or withdrawal changes principal on its event date; a rate change applies after accrual through that date. Withdrawals are capped at the remaining principal in the estimate.

Unknown terms are shown between a simple-accrual scenario and a daily-compounded scenario. That is a scenario range, not a confidence interval. Gross yield tax is estimated as total accrued interest multiplied by `(1 − tax rate / 100)` for display; the prototype does not model tax withholding timing or reinvestment of after-tax amounts. Net yields are used as entered. Payout dates are approximated from the start date and frequency. Bond face value is used; market price, yield-to-maturity, coupon conventions and provider rounding are not modeled. MMF rates are held constant only as a scenario.

Projections are estimates, not guaranteed returns or financial advice.

## Privacy, authentication and next phase

Statement files are processed in the browser and are not uploaded. Only selectable text is parsed, and every extracted field must be reviewed before saving. Multi-investment detection relies on repeated principal labels and can miss or mis-group statement layouts; always verify against the source. The prototype stores personal entries in local storage on the current browser profile. Do not use it for sensitive real financial records on a shared device.

Sign-in, password reset and magic-link flows are intentionally not wired yet. They require the Supabase backend phase so authentication is real and records can be isolated per user; a local-only login would give a false sense of security. The empty `supabase` folder is not a configured project. Before real use, add Supabase Auth, per-user row-level security, backups, deletion/export handling, and a privacy review.

For screen readers, mobile cards expose table roles and descriptive labels. This environment has no VoiceOver or TalkBack device, so manual VoiceOver and TalkBack validation remains necessary before release.

