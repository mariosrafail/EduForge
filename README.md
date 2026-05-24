# Hamilton House Publishers LMS Demo

Client-facing Hamilton House Publishers LMS demo for ELT publishers, schools, teachers, and students. The codebase may still use internal names in files or components, but the visible product branding for the current demo is Hamilton House Publishers LMS.

## Brand Assets

Brand assets imported by React live in `src/assets/branding/`.
Favicon and app icon files live in `public/`.

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
database/002_basic_auth.sql
database/003_activities_assignments.sql
database/004_course_content.sql
```

The migration creates:

- `schools`
- `app_users`
- `classes`
- `class_students`
- `activities`
- `assignments`
- `activity_submissions`
- `courses`
- `lessons`
- `lesson_activities`
- `lesson_submissions`

It also seeds a demo school:

- `Hamilton House ELT Demo`
- primary color `#f97316`
- secondary color `#0b1f3a`

If the database has no users, the Admin screen shows `Create your first user`. The migration includes a small optional seed set for the Hamilton House demo school.

`database/002_basic_auth.sql` adds demo/MVP authentication support:

- `password_hash`
- `last_login_at`
- `auth_provider`
- `auth_sessions`

Passwords are hashed in Netlify Functions. Plain text passwords are never stored.

`database/003_activities_assignments.sql` adds the demo/MVP activity authoring flow for interactive book-based practice:

- teacher-created interactive activities
- class or student assignments
- auto-scored submissions and revision guidance

The current UI uses a frontend mock service in `src/services/activitiesApi.js`, structured so these tables can be connected to Netlify Functions in a later phase.

`database/004_course_content.sql` adds demo/MVP persistence for editable Hamilton House course content:

- editable course/book metadata
- editable lesson metadata
- editable lesson activities stored as JSONB
- persisted student lesson submissions

It seeds:

- course: `English Skills B1`
- book code: `B1-DEMO-2026`
- lesson: `Welcome 2 - Vocabulary 4`
- activities: gap fill, line matching, and multiple choice

This is demo/MVP persistence for course content, not a full production CMS yet.

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

Test the course content function:

```bash
curl http://localhost:8888/.netlify/functions/course
```

Test editable course persistence:

1. Run `database/004_course_content.sql` in the Neon SQL Editor.
2. Run `netlify dev`.
3. Open `http://localhost:8888/#teacher-course-editor`.
4. Edit the course, lesson, or an activity.
5. Click `Save changes`.
6. Open `http://localhost:8888/#student-course`.
7. Confirm the student course shows the updated content.

Test signup:

```bash
curl -X POST http://localhost:8888/.netlify/functions/auth-signup \
  -H "Content-Type: application/json" \
  -d "{\"schoolName\":\"Hamilton House Demo School\",\"adminName\":\"Sofia Laskari\",\"email\":\"sofia@example.com\",\"password\":\"password123\"}"
```

Test signin:

```bash
curl -X POST http://localhost:8888/.netlify/functions/auth-signin \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"sofia@example.com\",\"password\":\"password123\"}"
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
- Demo/MVP authentication uses bcrypt password hashes and httpOnly session cookies.
- Session tokens are hashed before being stored in Neon.
- This demo does not implement full enterprise authentication, OAuth, MFA, forgot password, or role-based authorization yet.
