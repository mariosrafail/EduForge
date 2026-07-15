-- Development/demo login credentials for the Hamilton House seed users.
-- Password for all three accounts: password123

update app_users
set password_hash = '$2b$12$TbcfsTmq6FFDE.aOFgkBuelsJsvqk.140AXzYhTFlta7idf64o.c6',
    auth_provider = 'password',
    status = 'active'
where lower(email) in (
  'elena.admin@example.com',
  'maria.teacher@example.com',
  'anna.student@example.com'
);
