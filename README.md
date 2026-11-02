# Yieldwise dashboard frontend

A responsive React + TypeScript frontend prototype for an income-investment tracker. This phase is intentionally frontend-only: it uses fictional sample records and browser local storage. No accounts, backend, provider connections, or real credentials are configured.

## Run locally

Requires Node.js 20 or later.

```sh
npm install
npm run dev
```

To check TypeScript and create a production build:

```sh
npm run typecheck
npm run build
npm run preview
```

## Included in this phase

- Dashboard cards for total principal, estimated current value, and projected earnings.
- A time-based chart with 3, 6, 12 and 24-month controls.
- Investment list with edit and delete actions.
- Add/edit form for MMFs, bonds and other income investments, with provider, principal, currency, rate, dates, maturity, frequency and interest treatment.
- Browser-local PDF text extraction for selectable-text PDFs, with an editable review step before save. Scanned PDFs show a manual-entry fallback; no external OCR or AI service is used.
- CSV export, responsive mobile cards, validation, empty and error states, and keyboard-friendly accessible controls.
- Fictional sample investments persisted in this browser. Clear the `yieldwise-demo-investments-v1` local-storage key to restore the sample data.

## Calculation assumptions

The app uses calendar days under ACT/365 and stops at a maturity date if supplied.

- Simple accrual: `principal × (annual_rate / 100) × days / 365`.
- Compound estimate: `principal × (1 + annual_rate / 100 / m)^(m × days / 365)`, where `m` is the selected compounding periods per year.
- Compounding is applied only when the user selects reinvestment and a known frequency. Paid-out or unknown terms use simple accrual.
- An MMF projection holds its entered yield constant as a scenario. Bond estimates use face value as principal and do not model bond market price, yield-to-maturity, provider-specific coupon conventions, taxes or fees.

All projections are estimates, may differ from provider calculations, are not guaranteed returns and are not financial advice.

## Later backend phase

The current frontend stores edits in local storage only; it is not appropriate for multiple users or shared devices. A later backend phase should add authentication, per-user database access controls, server-side backups and deletion/export controls before real user information is collected. The investment and calculation types are separated from the local storage module to make that connection straightforward.
