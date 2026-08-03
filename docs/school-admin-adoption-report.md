# School Admin adoption report

Hamilton House LMS provides a live, School Admin-only adoption report for the authenticated school. School Admin branding persistence, CSV invitation import, and adoption CSV export are implemented; the three PR-006 workflows are fully remediated.

The summary and export aggregate current database records by active book package. A package is included only when the school has a package-specific activation code, active Student or Teacher entitlement, assignment, or submission. The report never accepts a school identifier from the browser.

The CSV columns are:

`generated_at_utc`, `school_name`, `publisher_name`, `book_package_title`, `book_package_slug`, `level`, `codes_generated`, `codes_redeemed`, `codes_unused`, `codes_expired`, `codes_revoked`, `active_student_entitlements`, `active_teacher_entitlements`, `active_assignments`, `unique_submitted_assignments`, `unique_students_submitted`, `scored_submissions`, `average_score_percent`, `last_submission_at_utc`.

Submission metrics use the latest row for each assignment/Student pair, ordered by `submitted_at` descending with submission ID as a deterministic tie-breaker. Score averages include only those latest rows whose score is non-null; zero is a scored result, while no scored work produces `null` in JSON and an empty CSV cell.

The export contains aggregate totals only. It excludes names and emails of Students and Teachers, user and tenant IDs, class invite codes, activation-code values and masks, answers, feedback, tokens, sessions, and request data. All database text is protected against spreadsheet formulas, CSV cells are escaped, and timestamps are UTC ISO-8601.

An empty school receives real zeros and nulls and cannot download a header-only file. A successful download records one `school_adoption_exported` security event containing only package, row, generated-code, active-assignment, and latest-submission-pair counts. Summary reads do not create audit events, and audit failure prevents the CSV response.
