# MVP Live Demo QA

## Setup Checklist

- Run `npm install`.
- Run database migrations `001` to latest in Neon/Postgres.
- Set `.env` or Netlify environment variable `DATABASE_URL`.
- Run `npm run dev:netlify` for local functions.
- Run `npm run build` before demo handoff.

## Demo Accounts Needed

- Admin account for school setup and metrics.
- Teacher account for class, assignment, feedback, and CSV export flows.
- Student account for invite signup, class join, submission, grades, and feedback flows.

## Manual Flow

1. Admin signs in.
2. Admin creates teacher.
3. Teacher signs in.
4. Teacher creates class.
5. Teacher copies invite link.
6. Student opens invite while signed out.
7. Student creates account from invite.
8. Student activates book code if provided.
9. Student joins class.
10. Teacher creates assignment.
11. Student sees assignment.
12. Student submits.
13. Student sees grade.
14. Teacher sees result.
15. Teacher saves feedback.
16. Student sees feedback.
17. Teacher exports CSV.
18. Admin sees school metrics.

## Security Checks

- Student cannot access another `studentId`.
- Teacher cannot access another `teacherId`.
- Admin cannot access another school.
- Content editing requires teacher/admin.
- Activation cannot be used for another user except same-school admin managing allowed access.
- Public invite endpoints expose only invite-safe class fields.
- Re-clicking activation does not inflate `used_count`.
- Re-clicking join does not duplicate `class_students`.

## Regression Checklist

- `npm run build` passes.
- No route crashes with empty `currentUser`.
- Demo mode still opens portals with fallback warnings.
- Live mode requires real login.
- Admin metrics load from `adminMetricsApi`.
- Student signup from invite creates a real session.
- Student can join class after signup.
- `assignment-results` loads by `assignmentId`.
- CSV export works.
- Teacher feedback saves and appears in student grades.
- Legacy `action=assign` routes through the safe assignment creation path.

## Known Demo Limitations

- No MFA.
- No forgot password.
- No full licensing system.
- Demo bulk activation is UI-only.
- Content package ownership is role-guarded but not fully tenant-modeled yet.
