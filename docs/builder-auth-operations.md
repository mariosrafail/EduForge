# Builder developer authentication operations

## Purpose and Phase 1 boundary

The hosted Publisher Book Builder is restricted to dedicated Builder developer accounts. Authentication is required before the existing hosted review renders. After sign-in, the Builder remains read-only: this milestone adds no hosted authoring persistence, upload, mutation, filesystem, GitHub, or `__hhplms` endpoint.

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

This applies the production manifest through `031_builder_developer_auth.sql`. Do not run it against a production/shared database.

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

After the migration and account provisioning are complete, set both runtime variables in the Builder Netlify project and redeploy the Builder site. The only deployed server route is `/builder/api/auth`, backed by the dedicated `builder-auth` Function. The Viewer remains static and zero-Function.
