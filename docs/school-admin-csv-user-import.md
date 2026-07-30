# School Admin CSV user import

School Admin branding persistence and CSV invitation import are implemented. Publisher/adoption export remains a non-downloading preview, so PR-006 is not fully closed.

The importer accepts UTF-8 comma-separated files up to 256 KiB and 200 user rows. Required headers are `full_name`, `email`, and `role`; `name` is the only alias for `full_name`. The optional header is `level`. No other headers are accepted.

Roles are limited to Teacher and Student. Levels may be blank or one of `Primary (Pre-A1)`, `A1`, `A2`, `B1`, `B1+`, `B2`, `C1`, and `C2`.

The browser parses the file as text and requests a server validation preview. Import requires a separate confirmation. The server repeats validation, duplicate detection, and the global existing-email check at commit time. A batch is all-or-nothing: invited users, hashed initial-password tokens, email outbox rows, and safe audit events are created in one PostgreSQL statement.

Imported accounts:

- belong to the authenticated School Admin's tenant;
- start in `invited` status with no password hash or session;
- receive the existing initial-password invitation lifecycle;
- do not receive class membership or book access.

Invitation delivery occurs after the database commit with bounded concurrency. Delivery failure does not remove an invited account; the UI reports partial delivery truthfully, and the existing user-table resend action remains available.

The original CSV and raw invitation tokens are not stored by the import workflow or returned to the browser.
