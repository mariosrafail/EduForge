-- Deterministic entitlement for the historical Hamilton House demo identities.
-- This is deliberately scoped to the exact seeded school, emails, and roles.
with demo_entitlements as (
  select
    app_user.id as user_id,
    package_record.id as book_package_id,
    case app_user.role
      when 'admin' then 'school_admin'
      when 'teacher' then 'teacher'
    end as role_scope
  from app_users app_user
  join schools school on school.id = app_user.school_id
  cross join book_packages package_record
  where school.name = 'Hamilton House ELT Demo'
    and package_record.slug = 'ultimate-b2'
    and package_record.status = 'active'
    and app_user.status = 'active'
    and (
      (lower(app_user.email) = 'elena.admin@example.com' and app_user.role = 'admin')
      or
      (lower(app_user.email) = 'maria.teacher@example.com' and app_user.role = 'teacher')
    )
)
insert into book_access (user_id, book_package_id, role_scope)
select user_id, book_package_id, role_scope
from demo_entitlements
where role_scope is not null
on conflict (user_id, book_package_id, role_scope) do nothing;
