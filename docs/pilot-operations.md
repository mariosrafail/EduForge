# Pilot operations and rollback

## Deployment sequence

1. Create and verify a restorable database backup before migrations. Record its identifier, timestamp, encryption status, and restore owner outside Git.
2. With the complete hosted staging environment from `.env.example` still set, run `npm ci`, `npm run staging:preflight`, and `npm run staging:migrate`. `DATABASE_URL` is the hosted application runtime connection and must identify the same host, port, and database as the explicitly confirmed `STAGING_DATABASE_URL`; do not unset or rewrite either variable between these commands. The migration command re-runs the complete hosted preflight, including production-fingerprint and application-origin separation, before it internally hands only the confirmed staging target to the lower-level database guard and opens a pool. The manifest runner must exclude `012_demo_login_passwords.sql`.
3. Run seed, integrity, smoke, cleanup, and final integrity against the confirmed staging database.
4. Deploy the exact tested commit. Verify basic/private health, then manually run both scheduled functions from the Netlify Functions page.
5. Enable the pilot only after SMTP, browser, tenant-isolation, backup-restore, and monitoring evidence is signed off.

Migration `016` is additive. Application rollback should normally redeploy the prior build while leaving additive tables/indexes in place. Dropping migration objects during an incident is not the default rollback.

## Disable and emergency controls

- SMTP: staging may use gated `preview`; for an incident disable invitations and remove/rotate compromised SMTP credentials.
- Invitations: set `ACCOUNT_INVITATIONS_ENABLED=false` and redeploy. Existing links remain governed by expiry/revocation.
- Dispatcher/cleanup: disable their schedules in code or Netlify controls, then redeploy. Preserve queued evidence.
- Sessions: use tenant-scoped admin revocation. Wider revocation requires an approved database runbook using `revoke_account_sessions()`.
- Leaked invitation/reset link: revoke its hash, revoke sessions if consumed, issue a replacement, and retain the security event.
- SMTP compromise: disable delivery, rotate SMTP and operational secrets, review aggregate delivery history, and notify through an approved channel.
- Salt rotation: deploy new random values through Netlify secret storage. Document that correlation windows reset.

## Restore procedure

Stop writes and scheduled workers, preserve evidence, restore into a new isolated database, run integrity checks, compare migration history, and switch the application only after approval. Never overwrite the only backup. Revoke sessions and rotate affected secrets after a credential or integrity incident.

## Pilot monitoring thresholds

| Signal | Investigate | Temporarily disable | Pause pilot / rollback |
|---|---:|---:|---:|
| Authentication failures | >10% for 15 min | >25% for 15 min | >50% or valid users locked out |
| Invitation/reset delivery failures | 2 in 15 min | 5 in 30 min | sustained provider outage >30 min |
| Outbox exhausted | 1 row | 3 rows | growing across two dispatcher runs |
| Dispatcher/cleanup failures | 1 run | 2 consecutive | 3 consecutive or unexpected deletion |
| Rate-limit `429` | >5 per journey | >20/min per route | school-wide false positives |
| Tenant integrity | any non-zero | disable affected mutation | pause immediately |
| Database | >1% errors or p95 >1 s | >5% or p95 >3 s | unavailable >5 min |
| Netlify functions | >1% errors in 15 min | >5% | critical path unavailable |
| Frontend fatal errors | 2 distinct users | >5% sessions | core portal unusable |
| Assignment/submission | 1 confirmed failure | 3 in 30 min | data loss or tenant symptom |

Retain security events, aggregate operational runs, deployment IDs, backup evidence, and tester evidence under the approved incident policy without copying secrets into tickets.

## Manual platform actions

1. Create a branch-deploy or separate staging site with an identifiable staging hostname and HTTPS certificate.
2. Add staging-only variables from `.env.example` using Netlify secret storage; function secrets do not belong in `netlify.toml`.
3. Provision a separate staging database and record the production database identity SHA-256 fingerprint.
4. Configure a dedicated non-production SMTP inbox and approve staging sender-domain DNS records.
5. Deploy, confirm both workers show a `Scheduled` badge, use **Run now**, and verify aggregate run rows.
6. Configure and verify `docs/edge-rate-limiting.md` rules in the Netlify account.
7. Connect monitoring to basic and authenticated private health.
8. Store screenshots, email renders, DNS, backup/restore, and sign-off evidence outside the repository.
