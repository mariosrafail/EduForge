# Hamilton House Publishers LMS Demo

Client-facing Hamilton House Publishers LMS demo for ELT publishers, schools, teachers, and students. The codebase may still use internal names in files or components, but the visible product branding for the current demo is Hamilton House Publishers LMS.

## Run Frontend Only

```bash
npm install
npm run dev
```

Open:

```bash
http://localhost:8000
```

When running only Vite, Netlify Functions are not available. Admin user creation will show a visible mock fallback warning.

## Database Setup

Create a Neon PostgreSQL database and run:

```sql
database/001_init_lms_demo.sql
```

The migration creates:

- `schools`
- `app_users`
- `classes`
- `class_students`

It also seeds a demo school:

- `Hamilton House ELT Demo`
- primary color `#f97316`
- secondary color `#0b1f3a`

If the database has no users, the Admin screen shows `Create your first user`. The migration includes a small optional seed set for the Hamilton House demo school.

## Required Environment Variable

Set this only in Netlify or your local Netlify dev environment:

```bash
DATABASE_URL=your_neon_connection_string
```

Do not add `DATABASE_URL` to frontend code. React components call Netlify Functions under `/.netlify/functions/...`.

## Local Netlify Functions

Install the Netlify CLI if needed:

```bash
npm install
npm install -g netlify-cli
```

Create a local `.env` file for Netlify dev only:

```bash
DATABASE_URL=your_neon_connection_string
```

Run:

```bash
netlify dev
```

Open:

```bash
http://localhost:8888
```

Test the users function:

```bash
curl http://localhost:8888/.netlify/functions/users
```

## Netlify Deploy

1. Add `DATABASE_URL` in Netlify Site settings > Environment variables.
2. Deploy the site.
3. Test:

```bash
https://your-site.netlify.app/.netlify/functions/users
```

## Admin User API

Endpoints:

- `GET /.netlify/functions/users`
- `GET /.netlify/functions/users?school_id=SCHOOL_ID`
- `POST /.netlify/functions/users`
- `PATCH /.netlify/functions/user?id=USER_ID`
- `DELETE /.netlify/functions/user?id=USER_ID`

Create user payload:

```json
{
  "full_name": "Sofia Laskari",
  "email": "sofia@example.com",
  "role": "teacher",
  "level": "B1 Junior",
  "status": "active"
}
```

Allowed roles:

- `admin`
- `teacher`
- `student`

Allowed statuses:

- `active`
- `invited`
- `paused`

## Security Notes

- `DATABASE_URL` is read only inside Netlify Functions.
- The frontend never imports database code.
- Functions validate role and status values.
- Queries use Neon parameterized template queries.
- This demo does not implement full authentication yet.
