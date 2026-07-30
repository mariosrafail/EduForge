# Portal dashboard metrics

Teacher and Student dashboard summaries come from the authenticated
`GET /.netlify/functions/book-content?action=dashboard-metrics` endpoint. The
handler derives the user, role, and school from the ordinary LMS session; it
does not accept user or tenant identity parameters.

Teacher counts include accessible active book packages and components, active
owned classes, distinct active students in those classes, and open assignments
owned by the teacher. Student counts include accessible active book packages
and components, visible direct or active-class assignments, and each visible
assignment's latest submission. A numeric zero is returned only after a
successful database query. The average is `null` when no latest submission has
a score; a real zero score remains part of the rounded average.

Student class names are deduplicated and sorted case-insensitively. The first
name in that order is the primary class, and its level takes precedence over
the student's account level.

All responses, including authentication and server errors, are private,
non-cacheable, and vary by cookie. The endpoint requires the existing schema
and package-access model and adds no migration.
