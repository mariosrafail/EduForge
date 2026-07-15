# Edge and WAF rate-limit readiness

Database-backed limits remain authoritative. Edge controls are an additional abuse shield and must never replace tenant, account, or fingerprint checks in the functions. Netlify function rate limits can be declared in function `config`, while account-level WAF rules must be applied and verified in the Netlify UI. No account-level WAF change is claimed by this repository.

| Route | Window / normal limit | Burst | Block | Key | Expected response |
|---|---:|---:|---:|---|---|
| `auth-signin` | 5 minutes / 20 | 5 | 15 minutes | IP plus normalized account hash in the app | `429`, `Retry-After` |
| `auth-forgot-password` | 15 minutes / 10 | 3 | 30 minutes | IP; app also uses email hash | Generic `429`, `Retry-After` |
| `account-token-check` | 15 minutes / 30 | 5 | 30 minutes | IP; app uses token-independent fingerprint | Generic `429`, `Retry-After` |
| `account-invite` resend | 15 minutes / 20 | 5 | 30 minutes | Authenticated admin/IP and email hash | `429`, `Retry-After` |
| class invite lookup | 15 minutes / 40 | 10 | 15 minutes | IP | Non-disclosing `429` |
| student signup | 30 minutes / 10 | 3 | 60 minutes | IP and normalized account hash | `429`, `Retry-After` |
| `operational-health` basic | 1 minute / 60 | 10 | 5 minutes | IP/domain | Minimal `429` |
| dispatcher HTTP endpoint | 1 minute / 5 | 1 | 60 minutes | IP; secret still mandatory | `401` before work or `429` |
| scheduled dispatcher/cleanup | Exempt internal schedule | — | — | Netlify scheduled invocation | No public route |

Deployment procedure:

1. Apply rules first to hosted staging and verify normal QA traffic plus `Retry-After` behavior.
2. Exclude Netlify scheduled functions, because scheduled functions do not accept public production URL calls.
3. Alert on sudden `429` growth, but never log email values, tokens, cookies, or full IPs.
4. Roll out to production in monitor mode where available, then enforce after reviewing false positives.
5. Record actual Netlify rule identifiers and screenshots in the private pilot evidence store, not this repository.

Reference: [Netlify function rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).
