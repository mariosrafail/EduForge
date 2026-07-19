# Database migration order

Apply production migrations in this exact order:

1. `001_init_lms_demo.sql`
2. `002_basic_auth.sql`
3. `003_activities_assignments.sql`
4. `004_course_content.sql`
5. `005_word_search_activity.sql`
6. `006_book_content_platform.sql`
7. `007_teacher_classes.sql`
8. `008_english_journey_6_book_package.sql`
9. `009_book_page_hotspots.sql`
10. `010_assignment_live_flow.sql`
11. `010_assignment_mvp_metadata.sql`
12. `011_authorization_tenant_isolation.sql`
13. `013_authorization_phase2.sql`
14. `014_account_lifecycle.sql`
15. `015_account_lifecycle_hardening.sql`
16. `016_operations_readiness.sql`
17. `017_book_licensing.sql`
18. `018_book_assets.sql`
19. `019_ultimate_b2_unit2_normalized_activities.sql`
20. `020_ultimate_b2_unit2_recovered_activities.sql`

The two `010` files are historical, already-deployed migrations. Their duplicate number is resolved by this manifest rather than renaming applied files. New migrations must use a unique, increasing number.

`012_demo_login_passwords.sql` is intentionally excluded from production order. It contains demo-only password hashes and may be applied only to local/demo databases.

After `013`, query `tenant_integrity_issues` and reconcile every non-zero row before treating tenant isolation as fully enforced. The migration applies `NOT NULL` only where existing rows are already safe; it never assigns unknown rows to the Hamilton House demo school.
