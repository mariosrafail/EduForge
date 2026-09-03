# LMS grade analytics and student runtime

Teacher performance data is read through `action=teacher-grade-analytics` on the existing `book-content` compatibility endpoint. The handler accepts optional class, assignment, package, component, assignment-status, and assigned-date-window filters. It derives Teacher and school identity from the authenticated session and validates every selected ID against that Teacher's scoped filter options.

An assigned slot is one selected assignment crossed with each currently active assigned Student. `submitted` counts slots with a latest final submission, and `missing` is the remaining slots. Completion is `submitted / assignedSlots`. Average, median, high, and low use only authoritative numeric final scores; missing and unscored/awaiting-review work is excluded. Score statistics and percentages round to one decimal place, and no scored work returns `null`. The presentation bands are Excellent (85–100), Good (70–84.99), Developing (50–69.99), and Needs support (below 50); they are descriptors, not a pass/fail policy. Trend points are grouped by calendar week from the latest final submission per Student and assignment and are capped at 12 points.

The LMS student activity shell has three explicit modes:

- `practice`: editable student-safe activity, fullscreen allowed, no final submission and no grade persistence.
- `assigned`: editable only while the server state permits a final submission; confirmation is required before the one server request.
- `review`: saved responses are read-only, with no mutation or second-submit path.

Published-native submission envelopes contain only the assignment ID and the versioned response items derived from the server-pinned target. Legacy envelopes contain only assignment ID, activity ID, and answers. Client scores, counts, identity fields, Teacher material, and target overrides are not submitted. The server remains authoritative for membership, deadline/status, immutable target resolution, scoring, and the unique final-submission slot. A duplicate-final conflict reloads the authoritative assignment and enters review mode; other failures preserve the local responses and keep the confirmation open.

Normal Book hotspots use practice mode. Missing assigned page mapping falls back to the pinned activity-only view without fabricating a page or target. Unsupported/display-only activities never expose a final-submit control.
