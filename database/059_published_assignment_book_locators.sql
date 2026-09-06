-- Preserve the selected published placement without changing target identity,
-- content, grades, or historical assignments. Legacy rows remain NULL.
alter table activity_assignments add column if not exists native_book_locator jsonb;
alter table homework_items add column if not exists native_book_locator jsonb;

alter table activity_assignments add constraint activity_assignments_native_book_locator_check check (
  native_book_locator is null or (
    target_kind = 'published_native' and jsonb_typeof(native_book_locator) = 'object'
    and native_book_locator ?& array['pageId', 'hotspotId']
    and jsonb_typeof(native_book_locator->'pageId') = 'string'
    and jsonb_typeof(native_book_locator->'hotspotId') = 'string'
    and (not (native_book_locator ? 'productReleaseId') or jsonb_typeof(native_book_locator->'productReleaseId') = 'string')
    and (native_book_locator - 'pageId' - 'hotspotId' - 'productReleaseId') = '{}'::jsonb
  )
);
alter table homework_items add constraint homework_items_native_book_locator_check check (
  native_book_locator is null or (
    target_kind = 'published_native' and jsonb_typeof(native_book_locator) = 'object'
    and native_book_locator ?& array['pageId', 'hotspotId']
    and jsonb_typeof(native_book_locator->'pageId') = 'string'
    and jsonb_typeof(native_book_locator->'hotspotId') = 'string'
    and (not (native_book_locator ? 'productReleaseId') or jsonb_typeof(native_book_locator->'productReleaseId') = 'string')
    and (native_book_locator - 'pageId' - 'hotspotId' - 'productReleaseId') = '{}'::jsonb
  )
);
