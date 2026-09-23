-- Migration: add hr_manager role
-- Run once on any existing database before deploying the new backend/frontend build.
-- Safe to run multiple times (ALTER COLUMN with an already-present value is a no-op on MySQL).

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'company_owner', 'sales_manager', 'project_coordinator',
    'import_manager', 'installation_engineer',
    'hr_manager', 'supplier', 'customer'
  ) NOT NULL;

-- Re-assign hamza@businesslinks-pk.com to the new hr_manager role.
-- The UPDATE is a no-op if the user does not exist yet or is already hr_manager.
UPDATE users
  SET role = 'hr_manager'
WHERE email = 'hamza@businesslinks-pk.com'
  AND role = 'sales_manager';
