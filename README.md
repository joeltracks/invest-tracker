# Yieldwise dashboard prototype

Responsive React + TypeScript frontend for tracking income investments. New portfolios start empty. Profiles, investment records and KES settings are stored in this browser. Database integration and secure authentication are deferred.

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
- Manual investment entry with editable product templates and duplicate warnings.
- Undo after deletion, CSV export, responsive holdings cards with table roles and labels, validation, keyboard controls, and an empty state.

## Projection assumptions

All calculations use ACT/365 calendar days and accrue separately between ledger events. For each segment, simple interest is `principal × (annual rate / 100) × days / 365`. Compounding uses `balance × ((1 + annual rate / 100 / m)^(m × days / 365) − 1)`, where `m` is the selected compounding frequency. A deposit or withdrawal changes principal on its event date; a rate change applies after accrual through that date. Withdrawals are capped at the remaining principal in the estimate.

Unknown interest treatment, or unknown compounding frequency for reinvested interest, is shown between a simple-accrual scenario and a daily-compounded scenario. Unknown payment timing with explicitly paid-out interest still uses simple accrual and never inflates retained principal. At-maturity reinvestment terms accrue simply and retain interest until maturity, without interim compounding. That is a scenario range, not a confidence interval. Gross yield tax is estimated as total accrued interest multiplied by `(1 − tax rate / 100)` for display; the prototype does not model tax withholding timing or reinvestment of after-tax amounts. Net yields are used as entered. Payout dates are approximated from start-date anniversaries and frequency. Existing explicit coupon months are honored, using the start day as an approximate coupon day (clamped to month-end). New Treasury templates do not invent June/December dates. Changing frequency clears existing coupon-month overrides. Confirm actual dates on the statement. Payouts due today remain visible, because payment receipt is not tracked. The monthly list includes every remaining dated payout this month; amounts are the difference in cumulative income between consecutive payment boundaries, after the entered tax assumption. Remaining accrued interest is assumed paid at maturity, including a short final period. Periodically reinvested and unknown-treatment investments do not generate presumed cash payouts. Interest payable at maturity is shown without including principal redemption. Bond face value is used; market price, yield-to-maturity, coupon conventions and provider rounding are not modeled. MMF rates are held constant only as a scenario.

Projections are estimates, not guaranteed returns or financial advice.

## Privacy, authentication and next phase

The prototype stores personal entries in local storage on the current browser profile. Do not use it for sensitive real financial records on a shared device.

Profiles currently use local name/email selection. No passwords, email links or MFA are collected or simulated. They identify a workspace on this device and provide no security boundary against someone using the same browser. Configure real authentication and user-owned cloud storage in a future backend phase.

For screen readers, mobile cards expose table roles and descriptive labels. This environment has no VoiceOver or TalkBack device, so manual VoiceOver and TalkBack validation remains necessary before release.


## Accounts, goals, exchange rates and backups

Run npm install, npm run dev, npm test, npm run typecheck and npm run build (output: dist). Vercel uses Vite, build command npm run build, output directory dist. No environment variables or database are required for local profiles.

## Profile flow

- Visitors first land on a public page with scrollable product information, estimate assumptions and privacy notes. Returning users without an active tab session can browse it too; no login popup opens automatically.
- Functional actions (Add investment, Set income goal and Manage investments) lead to Sign up. The page offers Log in for an existing profile and Back to website. Name and email are validated; duplicate email addresses on this device are rejected.
- Log in opens a popup asking for the saved name and email. This selects a local workspace; no email is sent and no password is stored. The requested action survives switching between sign up and log in or reloading either URL, then opens after entry.
- Profile appears in the sidebar as a separate page with editable details, backup navigation, profile switching and explicit confirmation before local removal. It replaces the old Account & security section on Overview. No magic-link option is present.
- One profile ID scopes the holdings and KES preference keys. Switching selects both scopes before the dashboard mounts. Changing name/email preserves the same ID, investments and event history.
- The first profile can opt to copy investments and settings already entered in the browser. The original local workspace is retained. Additional profiles begin empty.
- Profile metadata is stored in localStorage; the selected profile ID is kept in sessionStorage for the current tab. Reloading an open portfolio tab resumes it; a new session returns to the public page until the user chooses to enter. Closing a profile returns to the public page.
- Entry URLs use hash routes (for example, `#signup?next=add-investment` and `#login?next=income-goal`), so Vercel needs no extra rewrite. Return actions are restricted to a fixed list; arbitrary redirect URLs are ignored. Personal portfolio components and their data-loading effects are not mounted for visitors. This is a frontend flow gate, not server-side authentication.
- Local profiles are not secure accounts. Anyone using the browser can open them; data is unencrypted and does not sync across devices. JSON export/import backs up investments, ledger, goals and rates, not profile identity or authentication. Use a private browser and keep financial backups private.
- Removing a profile clears only that profile's records and settings in this browser. Other profiles, the preserved original workspace and downloaded backups remain.

## Contact us & feedback

The sidebar destination below Profile opens a feedback form with topic choices, an optional 1–5 rating, a message and a required email address for feedback attribution and follow-up. Drafts stay in memory while moving between portfolio sections; reloading, switching profiles or logging out clears them. No note is queued or stored on a server, and investments or statements are never attached automatically.

Until the mailbox is ready, leave `VITE_CONTACT_EMAIL` blank. **Send feedback** copies the note, with a selectable fallback if clipboard access is unavailable. It explicitly says the note has not been sent.

When the mailbox is ready, set `VITE_CONTACT_EMAIL` to the chosen single email address in `.env.local` for local Vite development and in Vercel's environment variables, then redeploy. The address is public configuration, not a secret. **Send feedback** opens a draft in the user’s email app, where they can send the message. The prepared note remains selectable after opening the draft. This version has no server email delivery or delivery receipt. A future email API must keep provider credentials on the server.

## Deferred backend

The frontend no longer initializes or calls Supabase Auth. The existing client/config and Edge Function files are retained for a later integration phase; they are not part of the local profile flow. Configuring the old environment variables does not enable account services in this version. No database tables, policies or external accounts were created or changed for this work. Password sign-in, recovery, MFA, cloud synchronization and server account deletion require that future integration.

Manual rates mean: 1 source-currency unit = X reporting-currency units. Rates are user-set, not live quotes. Changing reporting currency clears conversions when saved. Any missing rate blocks combined totals and goal progress rather than silently assuming parity. Original currency views keep native amounts.

The monthly income estimate is next-12-month interest after entered tax assumptions, converted at user-set rates, divided by 12. It includes paid, accrued and reinvested income; actual payout timing varies. Unknown terms show simple-to-daily-compounded bounds; goal progress uses the lower estimate, capped at 100%. Scheduled and closed holdings are excluded; maturity caps accrual.

Templates are editable assumptions: Treasury bond = semiannual paid coupons; fixed deposit = payout at maturity; MMF = daily simple accrual, paid out. Confirm terms on your statement before selecting reinvestment. Initial principal, rate, start date and currency stay fixed after creation. Dated deposits, withdrawals and yield changes preserve history; current yield uses the latest effective rate event. Validation prevents withdrawals from overdrawing any later balance.

Motion: one 600ms chart reveal on first intersection. Content is visible without animation; reduced-motion uses the still state. Mobile preserves a native table in a keyboard-focusable horizontal region. Manual VoiceOver/TalkBack verification remains outstanding. Projections are estimates, not advice or guaranteed returns.

Calculation consistency: chart points, endpoints, investment reconciliation and combined-currency totals use the same tax-adjusted retained-value helpers. Paid-out earnings remain separate from account value. Future dated deposits and withdrawals affect the chart endpoint. Active weighted yield excludes matured, scheduled and closed holdings and weights the stated current rate by remaining principal; it is not an effective after-tax return. Date-only ledger and payout labels preserve the local calendar date rather than converting midnight to UTC.

## Kenya reporting and investment currencies

KES is the default for new holdings, portfolio totals, projections, the monthly income goal and payout equivalents. Holdings retain their original currency for statements and reconciliation. Foreign holdings require a positive finite manual quote in the direction `1 source unit = X KES`; KES value is original amount multiplied by that quote. One saved quote per currency applies to all its holdings and future projection dates. Quotes are user-set and are not fetched, verified or dated as live market rates. Update them whenever needed. No FX gains, historical FX movements, spread or conversion fees are modeled.

The visible conversion panel prompts for rates on existing foreign holdings and JSON imports. Missing active-currency rates block the complete total, goal progress and chart; the app never assumes currency parity or presents a partial portfolio as complete. The add/edit form also prompts for a quote before saving a foreign holding. Current and projected native amounts remain available in each holding; native amounts are never overwritten by their KES equivalents.

Older settings or backup settings that report in another currency are not reinterpreted as KES. Existing holdings keep their currency; fresh KES rates and a KES goal must be entered. Legacy JSON investments can be imported, while their non-KES reporting settings are excluded.

No investment samples are automatically loaded. Earlier built-in samples saved in the local/demo browser scope are removed on load only when their reserved IDs, names, providers, original currency/amount and yield still match, with no recorded events or statement reconciliation. Custom records and edited or reconciled samples are preserved. Signed-in account storage is not altered by this cleanup. Clearing an empty portfolio never re-seeds sample investments.

## Opening and current principal

Opening principal is retained as the historical starting amount. Current principal is opening principal plus effective dated top-ups, less effective dated withdrawals. A future event applies on its selected date; recording it does not change today's principal early. Valid withdrawals cannot exceed available capital or invalidate a later withdrawal. Income is recalculated between those dates using the principal then in effect.

The dashboard, investment row and edit view use current principal. Foreign-currency edit previews convert that current principal to KES. The ledger previews principal after the proposed event before it is recorded. CSV exports include separate opening/current principal columns and the snapshot date, so exported capital agrees with the dashboard without overwriting the opening balance or counting events twice. JSON backups retain opening amounts and the complete event ledger for re-import.
