# Builder developer authentication operations

## Purpose and Phase 3A boundary

The hosted Publisher Book Builder is restricted to dedicated Builder developer accounts. Authentication is required before the generic hosted shell renders. Ultimate B2 Students Book Hotspot Builder is now editable through the narrow server-authorized content API. Activity Builder and UI Controller remain read-only. No upload, filesystem, GitHub, local `__hhplms`, or automatic publication endpoint is exposed.

Builder developers are a separate global publisher trust domain. They are not `app_users`, have no school or tenant membership, and are not Platform Admins. An LMS role never grants Builder access, and a Platform Admin login/session never grants Builder access.

For the current dev/staging deployment, the LMS dev site and `hhplms-builder` use the same isolated staging PostgreSQL database. Their identities, sessions, cookies, rate-limit records, and audit records remain physically separate. This arrangement is not production readiness and does not authorize production database mutation.

## Staging developer identities

Provision exactly these staging-only identities. Passwords are supplied at runtime and are never stored in this repository.

- `builder.dev1@hhplms.invalid`
- `builder.dev2@hhplms.invalid`
- `builder.dev3@hhplms.invalid`
- `builder.dev4@hhplms.invalid`
- `builder.dev5@hhplms.invalid`

## Migrate the isolated staging database

Set `STAGING_DATABASE_URL` to the isolated staging database and set `STAGING_DATABASE_CONFIRMATION=isolated-staging-database`. Keep `DATABASE_URL` unset in this operator shell because the staging safety guard rejects accidental overlap. Then run:

```text
npm run staging:migrate
```

This applies the production manifest through `032_builder_component_authoring.sql`. Do not run it against a production/shared database. Codex implementation and automated validation must not run this staging command; an operator applies it manually after reviewing the commit.

## Provision the five staging accounts

Set the same staging database variables plus five unique passwords in:

- `HHPLMS_STAGING_BUILDER_PASSWORD_1`
- `HHPLMS_STAGING_BUILDER_PASSWORD_2`
- `HHPLMS_STAGING_BUILDER_PASSWORD_3`
- `HHPLMS_STAGING_BUILDER_PASSWORD_4`
- `HHPLMS_STAGING_BUILDER_PASSWORD_5`

Then run:

```text
npm run staging:seed:builder-users -- --confirm=seed-staging-builder-users
```

The command refuses missing or duplicate passwords and refuses to replace existing accounts. To perform a deliberate rotation later, add `--rotate`; rotation revokes all existing sessions. Neither operation prints plaintext passwords.

For a single explicitly confirmed account, use `npm run builder-user:create -- --confirm=create-builder-user --email=<email> --name=<name>`. Supply its password only as `BUILDER_USER_PASSWORD`. Hosted targets also require `BUILDER_USER_ENVIRONMENT` and `BUILDER_USER_DATABASE_CONFIRMATION=confirmed-builder-database`. Use `--rotate` only for an intentional password rotation.

## Netlify Builder runtime configuration

Configure these server-side environment variables on the dedicated Builder site:

- `DATABASE_URL` — the same isolated staging PostgreSQL database used by LMS dev for this dev/staging environment.
- `BUILDER_AUTH_RATE_LIMIT_SALT` — a unique random value of at least 32 characters.

Do not use `STAGING_DATABASE_URL` as a Netlify runtime variable. Do not create any `VITE_DATABASE_URL` or other frontend database variable. Do not substitute `AUTH_RATE_LIMIT_SALT` or `PLATFORM_ADMIN_RATE_LIMIT_SALT`.

After migration 032 is applied, redeploy the Builder site. The two public Builder server routes are `/builder/api/auth` and `/builder/api/content/*`, backed by `builder-auth` and `builder-content`. Underscore-prefixed modules are private helpers. The Viewer remains static and zero-Function.

After redeploy, perform a manual two-session concurrency smoke test: load the same hotspot revision in two authenticated sessions, save in the first, verify the second receives an explicit conflict without losing local edits, then use **Reload latest** and confirm the saved revision appears. A hotspot save updates Builder authoring state only; it does not publish to Viewer or Android.
