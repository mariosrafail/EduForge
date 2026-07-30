# School branding persistence

Ordinary authenticated users load their own school name, text mark, primary color, and secondary color from `GET /.netlify/functions/school-profile`. The endpoint derives the school exclusively from the ordinary session and never accepts a tenant identifier.

School Admins edit a local preview in School Setup. A preset also changes only that draft. The application-wide brand changes after `Save school profile` receives a successful response from `PATCH /.netlify/functions/school-profile`; `Discard changes` restores the last persisted values without a request. Saved branding reloads after refresh and is visible to authenticated administrators, teachers, and students in the same tenant.

PATCH validates the school name, text mark, approved high-contrast primary palette, secondary color, role, and request Origin on the server. The school update and `school_branding_updated` security event are one atomic SQL statement. Audit metadata contains changed field names only, and branding changes do not revoke sessions.

Loading, logout, tenant changes, stale requests, and profile-load failures use the neutral `School workspace` brand so one tenant's identity cannot remain visible for another account.

This implements only the branding-persistence portion of PR-006. CSV user import remains a preview/unimplemented workflow. Publisher adoption export remains a preview/unimplemented workflow. PR-006 is therefore not fully remediated.
