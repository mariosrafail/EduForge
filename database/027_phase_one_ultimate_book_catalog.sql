begin;

with publisher as (
  select id from publishers where slug = 'hamilton-house'
),
catalog(title, slug, level) as (
  values
    ('Ultimate English B1', 'ultimate-b1', 'B1'),
    ('Ultimate English B1+', 'ultimate-b1-plus', 'B1+')
)
insert into book_packages (publisher_id, title, slug, level, description, cover_asset_path, status)
select publisher.id, catalog.title, catalog.slug, catalog.level,
       'Content will be added when the publisher files are available.', null, 'active'
from publisher cross join catalog
on conflict (slug) do update
set title = excluded.title,
    level = excluded.level,
    description = excluded.description,
    cover_asset_path = null,
    status = 'active';

with component_seed(package_slug, title, slug, component_type, sort_order) as (
  values
    ('ultimate-b1', 'Ultimate English B1 Students Book', 'ultimate-b1-students-book', 'students_book', 1),
    ('ultimate-b1', 'Ultimate English B1 Workbook', 'ultimate-b1-workbook', 'workbook', 2),
    ('ultimate-b1-plus', 'Ultimate English B1+ Students Book', 'ultimate-b1-plus-students-book', 'students_book', 1),
    ('ultimate-b1-plus', 'Ultimate English B1+ Workbook', 'ultimate-b1-plus-workbook', 'workbook', 2)
)
insert into book_components (book_package_id, title, slug, component_type, cover_asset_path, sort_order)
select bp.id, seed.title, seed.slug, seed.component_type, null, seed.sort_order
from component_seed seed
join book_packages bp on bp.slug = seed.package_slug
on conflict (book_package_id, slug) do update
set title = excluded.title,
    component_type = excluded.component_type,
    cover_asset_path = null,
    sort_order = excluded.sort_order;

update book_packages set status = 'archived' where slug = 'english-journey-6';

commit;
