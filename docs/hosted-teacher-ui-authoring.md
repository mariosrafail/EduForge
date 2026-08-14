# Hosted Teacher UI authoring

The Ultimate B2 hosted Builder edits a fixed semantic catalog of Teacher Review interface bindings. It does not author layout, controls, routes, CSS, HTML, scripts, page/spread content, or the unwired publisher Navibar library. The saved `teacher_ui/default` Builder document is a strict override manifest over tracked canonical assets; deleting an override restores the tracked asset.

Uploads use the existing book-asset storage profiles. The authenticated Builder prepares an exact binding-scoped upload, sends bytes directly to a server-selected private staging object, and finalizes it through authoritative raster/audio/GAF inspection. Finalize promotes an immutable content-addressed public object and records a validated candidate, but does not change the Viewer. A separate revisioned Save proves candidate ownership and binding identity before writing through `builder_component_documents`. Migration `034_builder_teacher_ui_asset_uploads.sql` stores only this temporary candidate trust boundary; Task 6 Open Response tables are not reused.

The public Viewer reads only the no-store `ui-controller` projection and derives same-origin `/preview/ui-assets/<sha256>.<extension>` paths. A missing document means canonical tracked UI. The hosted runtime resolves one asset model before rendering and supplies it to the existing menu, stage background, toolbar, navigation/reveal, title animation, sounds, activity hotspot, and listening-player chrome. Standard LMS, Android Student, and Android Teacher offline builds use the canonical no-network provider.

## Operations boundary

Repository tests use isolated PostgreSQL and fake/local object storage. A real review environment still needs independently verified S3/R2 credentials, private signed-PUT CORS, and public CDN CORS that permits Viewer image/audio loads and `fetch()` of GAF files after redirects. The public and private buckets, lifecycle/expired-staging cleanup, concurrency/throughput, monitoring, backups, and disaster recovery remain operational responsibilities. Do not mutate production/shared bucket CORS or storage during repository validation.

This is draft/review authoring, not publication and not production Teacher authorization.
