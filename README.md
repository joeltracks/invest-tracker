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

Unknown interest treatment, or unknown compounding frequency for reinvested interest, is shown between a simple-accrual scenario and a daily-compounded scenario. Unknown payment timing with explicitly paid-out interest still uses simple accrual and never inflates retained principal. At-maturity reinvestment terms accrue simply and retain interest until maturity, without interim compounding. That is a scenario range, not a confidence interval. Gross yield tax is estimated as total accrued interest multiplied by `(1 − tax rate / 100)` for display; the prototype does not model tax withholding timing or reinvestment of after-tax amounts. Net yields are used as entered. Payout dates are approximated from start-date anniversaries and frequency. Existing explicit coupon months are honored, using the start day as an approximate coupon day (clamped to month-end). New Treasury templates do not invent June/December dates. Changing frequency clears existing coupon-month overrides. Confirm actual dates on the statement. Payouts due today remain visible, because payment receipt is not tracked. The monthly list includes every remaining dated payout this month; amounts are the difference in cumulative income between consecutive payment boundaries, after the entered tax assumption. Remaining accrued interest is assumed paid at maturity, including a short final period. Periodically reinvested and unknown-treatment investments do not generate presumed cash payouts. Interest payable at maturity is shown without including principal redemption. Bond face value is used; market price, yield-to-maturity, coupon conventions and provider rounding are not modeled. MMF rates are held constant only as a scenario.

Projections are estimates, not guaranteed returns or financial advice.

## Privacy, authentication and next phase

Statement files are processed in the browser and are not uploaded. Only selectable text is parsed, and every extracted field must be reviewed before saving. Multi-investment detection relies on repeated principal labels and can miss or mis-group statement layouts; always verify against the source. The prototype stores personal entries in local storage on the current browser profile. Do not use it for sensitive real financial records on a shared device.

Sign-in, password reset and magic-link flows are intentionally not wired yet. They require the Supabase backend phase so authentication is real and records can be isolated per user; a local-only login would give a false sense of security. The empty `supabase` folder is not a configured project. Before real use, add Supabase Auth, per-user row-level security, backups, deletion/export handling, and a privacy review.

For screen readers, mobile cards expose table roles and descriptive labels. This environment has no VoiceOver or TalkBack device, so manual VoiceOver and TalkBack validation remains necessary before release.


## Accounts, goals, exchange rates and backups

Run npm install, npm run dev, npm test, npm run typecheck and npm run build (output: dist). Copy .env.example to .env.local for local authentication. Without configuration the site remains usable in demo mode and clearly disables email/account services.

Supabase free-tier setup:
1. Create a Supabase project and enable Email auth. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY locally and in Vercel. Use the public project URL and anon/publishable key only. Never put a service-role key in a VITE_ variable.
2. In Authentication / URL Configuration, set Site URL and allowed redirect URLs to your deployed app and http://localhost:5173. Confirmation, magic links and password recovery return to the current app path. Magic-link sign-in expects an existing confirmed account. Configure an email provider for production delivery; the default service has limits.
3. Enable TOTP MFA. Enrollment requires scanning the QR code or adding the setup key and verifying a code. Later sign-ins require MFA before the portfolio opens. Supabase provides no recovery codes; consider enrolling a second authenticator.
4. Install the Supabase CLI and link the project: supabase login; supabase link --project-ref YOUR_PROJECT_REF. Set the Edge Function secret ALLOWED_ORIGIN to your deployed origin without a trailing slash, then deploy with supabase functions deploy delete-account. Supabase manages the hosted server URL and service-role key. The function validates bearer tokens with auth.getUser, checks recent authentication (five minutes), requires aal2 when MFA is enrolled, and deletes only that caller. The supplied config disables the legacy JWT gateway check because token verification happens explicitly inside the function.
5. Vercel: Vite framework, build npm run build, output dist. Add the two public environment variables and redeploy. Deploy the Edge Function separately and set its allowed origin to the app's deployed origin.

Data boundaries: authentication is live when configured. Holdings, event history, goals and FX remain browser-local, partitioned by user ID; there is no portfolio cloud synchronization in this release. Demo storage is separate. Browser storage is unencrypted; a shared browser profile is not a secure vault. JSON export contains only portfolio records and preferences, never sessions. Import validates the entire versioned file, shows a review and skips matching IDs or investment fingerprints. Financial backups should be stored privately.

Account deletion removes the Supabase login and database rows linked to auth.users with ON DELETE CASCADE, then clears this account's records in this browser. This app adds no portfolio tables or Storage objects. Downloaded backups and other devices' local copies remain under the user's control. If adding cloud persistence, add user-owned RLS and cascading ownership; if adding Storage, extend the server cleanup before deleting Auth users. Never connect deletion to a project with unrelated resources without reviewing that cleanup.

Manual rates mean: 1 source-currency unit = X reporting-currency units. Rates are user-set, not live quotes. Changing reporting currency clears conversions when saved. Any missing rate blocks combined totals and goal progress rather than silently assuming parity. Original currency views keep native amounts.

The monthly income estimate is next-12-month interest after entered tax assumptions, converted at user-set rates, divided by 12. It includes paid, accrued and reinvested income; actual payout timing varies. Unknown terms show simple-to-daily-compounded bounds; goal progress uses the lower estimate, capped at 100%. Scheduled and closed holdings are excluded; maturity caps accrual.

Templates are editable assumptions: Treasury bond = semiannual paid coupons; fixed deposit = payout at maturity; MMF = daily simple accrual, paid out. Confirm terms on your statement before selecting reinvestment. Initial principal, rate, start date and currency stay fixed after creation. Dated deposits, withdrawals and yield changes preserve history; current yield uses the latest effective rate event. Validation prevents withdrawals from overdrawing any later balance.

Motion: one 600ms chart reveal on first intersection. Content is visible without animation; reduced-motion uses the still state. Mobile preserves a native table in a keyboard-focusable horizontal region. Manual VoiceOver/TalkBack and configured email/MFA/deletion verification are still required. Projections are estimates, not advice or guaranteed returns.

Calculation consistency: chart points, endpoints, investment reconciliation and combined-currency totals use the same tax-adjusted retained-value helpers. Paid-out earnings remain separate from account value. Future dated deposits and withdrawals affect the chart endpoint. Active weighted yield excludes matured, scheduled and closed holdings and weights the stated current rate by remaining principal; it is not an effective after-tax return. Date-only ledger and payout labels preserve the local calendar date rather than converting midnight to UTC.

## Kenya reporting and statement currencies

KES is the default for new holdings, portfolio totals, projections, the monthly income goal and payout equivalents. Holdings retain their original currency for statements and reconciliation. Foreign holdings require a positive finite manual quote in the direction `1 source unit = X KES`; KES value is original amount multiplied by that quote. One saved quote per currency applies to all its holdings and future projection dates. Quotes are user-set and are not fetched, verified or dated as live market rates. Update them whenever needed. No FX gains, historical FX movements, spread or conversion fees are modeled.

The visible conversion panel prompts for rates on existing foreign holdings and JSON imports. Missing active-currency rates block the complete total, goal progress and chart; the app never assumes currency parity or presents a partial portfolio as complete. The add/edit form also prompts for a quote before saving a foreign holding. Current and projected native amounts remain available in each holding; native amounts are never overwritten by their KES equivalents.

Local PDF extraction recognizes ISO currency codes, KSh/KShs, currency labels and supported symbols near investment amounts. Each detected investment has its own currency review. Ambiguous dollar signs, conflicting labels or missing currency leave the currency unselected, requiring explicit confirmation. Foreign candidates show a conversion-rate field and KES principal preview before save. Reused saved quotes remain editable and are clearly user-set. Scanned PDFs still require manual entry; no external AI/OCR service is used. Extraction reads at most the first 12 pages and can miss unfamiliar layouts. Always check the statement.

Older settings or backup settings that report in another currency are not reinterpreted as KES. Existing holdings keep their currency; fresh KES rates and a KES goal must be entered. Legacy JSON investments can be imported, while their non-KES reporting settings are excluded.
