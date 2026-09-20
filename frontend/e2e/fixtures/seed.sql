-- Deterministic fixture for the e2e suite. All internal users share the
-- password "Password123!" (bcrypt hash below) — test accounts only.
INSERT INTO suppliers (id, name, contact_email) VALUES
  (1, 'Acme Machines GmbH', 'sales@acme-machines.example');

INSERT INTO users (id, name, email, password_hash, role, status) VALUES
  (1, 'Owen Owner', 'owen@businesslinks-pk.com', '$2y$12$7TFffMNbVhgqEyTZpLVUbOUxFEtjOZ8vzNYTKjGv9e09fdJD.TT9K', 'company_owner', 'active'),
  (2, 'Sana Sales', 'sana@businesslinks-pk.com', '$2y$12$7TFffMNbVhgqEyTZpLVUbOUxFEtjOZ8vzNYTKjGv9e09fdJD.TT9K', 'sales_manager', 'active'),
  (3, 'Pia Coordinator', 'pia@businesslinks-pk.com', '$2y$12$7TFffMNbVhgqEyTZpLVUbOUxFEtjOZ8vzNYTKjGv9e09fdJD.TT9K', 'project_coordinator', 'active'),
  (4, 'Imran Manager', 'imran@businesslinks-pk.com', '$2y$12$7TFffMNbVhgqEyTZpLVUbOUxFEtjOZ8vzNYTKjGv9e09fdJD.TT9K', 'import_manager', 'active'),
  (5, 'Eng Engineer', 'eng@businesslinks-pk.com', '$2y$12$7TFffMNbVhgqEyTZpLVUbOUxFEtjOZ8vzNYTKjGv9e09fdJD.TT9K', 'installation_engineer', 'active');

INSERT INTO projects (id, project_number, customer_name, customer_contact, title, sales_manager_id, project_coordinator_id, created_by) VALUES
  (1, 'PRJ-0001', 'Textile Mills Ltd', 'ops@textilemills.example', 'New spinning line', 2, 3, 2);

INSERT INTO orders (id, project_id, order_number, machine_name, machine_spec, supplier_id, start_date, target_handover_date, project_coordinator_id, installation_engineer_id, created_by) VALUES
  (1, 1, 'ORD-0001', 'Ring Spinning Frame RS-200', '200 spindles, 50Hz', 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 120 DAY), 3, 5, 2);

INSERT INTO order_stages (order_id, stage_id, status)
  SELECT 1, id, 'not_started' FROM stages;

UPDATE order_stages SET status = 'in_progress' WHERE order_id = 1 AND stage_id IN (6, 7, 8);
