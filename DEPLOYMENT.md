# Yieldwise deployment checks

Use a Vercel preview and a separate Supabase project with synthetic data for rehearsals. Keep the previous deployment available until the checks pass. Record the tested URL, Git commit, migration version, date, and outcome for each check.

| Control | Release check |
| --- | --- |
| Ownership | Apply migrations and run `supabase/tests/portfolio.sql` as the staging database owner. Sign in as two different users and try to read and modify a holding from the other account using the API. Check both accounts' snapshots afterwards. |
| Recovery | In Supabase Auth, verify the production site and recovery redirect URLs, transactional email configuration, and a short email OTP lifetime. With test inboxes, verify that a fresh link works, a used link fails, an expired link fails, and a newer request supersedes the older one. Check the updated password works. |
| Input and errors | Verify an invalid event or FX rate fails without changing the snapshot. Save a holding with HTML-like text and verify it displays as text. Test lost connectivity and an expired session. |
| CORS | Set `ALLOWED_ORIGIN` in each project's Edge Function secrets to its exact frontend origin, without a trailing slash. Use the preflight checks below for the deployed function. |
| Rate limits | Review the project's Auth rate limits and confirm staging requests reach HTTP 429. Per account, the portfolio allows 120 reads and 60 write attempts per calendar minute. Validation and conflict errors inside the write operation consume quota while the failed mutation rolls back. Account deletion has a separate five-attempt budget. |
| Database performance | Check the Supabase Performance Advisor and review query plans on representative holdings and ledgers. Check whether any client still uses the legacy `public.investments` table before changing its policies or retention. |
| Monitoring | Set up an uptime check on the deployed homepage and alert routing for Supabase Auth and Edge Function failures. Account deletion logs include event name, status and a request ID. Trigger a synthetic alert and confirm delivery to the release owner. |
| Rollback | Save the previous successful Vercel deployment link. In staging, promote a new deployment, roll back to the previous one, and test sign-in and portfolio saves on the migrated database. Restore a database backup to a separate project and verify the restored schema and data. A frontend rollback leaves Supabase migrations and functions in place. |

Replace the two placeholders with the release environment's values. The first command should return HTTP 204 and the exact configured origin. The second should return HTTP 403 and must never allow the unrelated origin.

```sh
curl -i -X OPTIONS 'https://PROJECT_REF.supabase.co/functions/v1/delete-account' \
  -H 'Origin: https://FRONTEND_HOST' -H 'Access-Control-Request-Method: POST'
curl -i -X OPTIONS 'https://PROJECT_REF.supabase.co/functions/v1/delete-account' \
  -H 'Origin: https://example.invalid' -H 'Access-Control-Request-Method: POST'
```

Deploy the database migration before deploying the updated `delete-account` Edge Function. The function uses the migration's service-only rate limiter. Deploy the frontend after both are ready. Confirm that the Vercel build points to the intended Supabase project and verify the cloud flow from that deployed URL.
