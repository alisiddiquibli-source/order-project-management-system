-- Order & Project Lifecycle Management System (Business Links International)
-- Initial schema, derived from docs/ARCHITECTURE.md v4 §9.
-- MySQL 8 / InnoDB / utf8mb4. Import via cPanel phpMyAdmin or `mysql < schema.sql`.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Suppliers, users, projects, orders
-- ---------------------------------------------------------------------------

CREATE TABLE suppliers (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    role                ENUM('company_owner','sales_manager','project_coordinator',
                              'import_manager','installation_engineer',
                              'supplier','customer') NOT NULL,
    status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
    -- set only for customer logins: which project they may see (every order in it)
    scope_project_id    INT UNSIGNED NULL,
    -- set only for supplier logins: which supplier company they represent
    supplier_id         INT UNSIGNED NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    -- Internal-role logins must be a Business Links International address;
    -- supplier/customer logins use their own company's email, so they're
    -- excluded. Enforced here as the hard backstop, not just in the
    -- account-creation API (defense in depth).
    CONSTRAINT chk_users_internal_email_domain CHECK (
        role IN ('supplier', 'customer') OR email LIKE '%@businesslinks-pk.com'
    ),
    INDEX idx_users_role (role),
    INDEX idx_users_scope_project (scope_project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE projects (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_number          VARCHAR(50) NOT NULL UNIQUE,
    customer_name           VARCHAR(255) NOT NULL,
    customer_contact        VARCHAR(255),
    title                   VARCHAR(255) NOT NULL,
    sales_manager_id        INT UNSIGNED NOT NULL,
    project_coordinator_id  INT UNSIGNED NOT NULL,
    status                  ENUM('active','completed') NOT NULL DEFAULT 'active',
    created_by              INT UNSIGNED NOT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_sales_manager FOREIGN KEY (sales_manager_id) REFERENCES users(id),
    CONSTRAINT fk_projects_coordinator FOREIGN KEY (project_coordinator_id) REFERENCES users(id),
    CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_projects_sales_manager (sales_manager_id),
    INDEX idx_projects_coordinator (project_coordinator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
    ADD CONSTRAINT fk_users_scope_project FOREIGN KEY (scope_project_id) REFERENCES projects(id);

-- MySQL's CHECK constraints are silently unenforced on server versions
-- older than 8.0.16 (and on some MariaDB builds) — confirmed in
-- production, where chk_users_internal_email_domain above parses but
-- never actually rejects a bad insert. Triggers are enforced on every
-- version, so they're the real backstop; the CHECK constraint stays too,
-- both as documentation and in case a server does honor it.
DELIMITER $$
CREATE TRIGGER trg_users_email_domain_insert BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    IF NEW.role NOT IN ('supplier', 'customer') AND NEW.email NOT LIKE '%@businesslinks-pk.com' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Internal-role users must have a @businesslinks-pk.com email address.';
    END IF;
END$$

CREATE TRIGGER trg_users_email_domain_update BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    IF NEW.role NOT IN ('supplier', 'customer') AND NEW.email NOT LIKE '%@businesslinks-pk.com' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Internal-role users must have a @businesslinks-pk.com email address.';
    END IF;
END$$
DELIMITER ;

CREATE TABLE orders (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id              INT UNSIGNED NOT NULL,
    order_number            VARCHAR(50) NOT NULL UNIQUE,
    machine_name            VARCHAR(255) NOT NULL,
    machine_spec            TEXT,
    supplier_id             INT UNSIGNED NOT NULL,
    -- static reference only, per BLI's decision — never monitored/reported on
    contract_value          DECIMAL(14,2) NULL,
    currency                VARCHAR(3) NULL,
    start_date              DATE NOT NULL,
    target_handover_date    DATE NOT NULL,
    status                  ENUM('active','on_hold','cancelled','completed') NOT NULL DEFAULT 'active',
    -- nullable override of the project's default PC; falls back when NULL
    project_coordinator_id  INT UNSIGNED NULL,
    installation_engineer_id INT UNSIGNED NOT NULL,
    warranty_start_trigger  ENUM('shipment','installation','sat','handover') NOT NULL DEFAULT 'handover',
    warranty_start_date     DATE NULL,
    warranty_end_date       DATE NULL,
    created_by              INT UNSIGNED NOT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_orders_coordinator FOREIGN KEY (project_coordinator_id) REFERENCES users(id),
    CONSTRAINT fk_orders_engineer FOREIGN KEY (installation_engineer_id) REFERENCES users(id),
    CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_orders_project (project_id),
    INDEX idx_orders_supplier (supplier_id),
    INDEX idx_orders_coordinator (project_coordinator_id),
    INDEX idx_orders_engineer (installation_engineer_id),
    INDEX idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only: an order's status only ever changes via a logged transition
-- (on_hold/cancelled require Sales Manager or Company Owner — enforced in the API).
CREATE TABLE order_status_changes (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id    INT UNSIGNED NOT NULL,
    old_status  ENUM('active','on_hold','cancelled','completed') NOT NULL,
    new_status  ENUM('active','on_hold','cancelled','completed') NOT NULL,
    reason      TEXT NOT NULL,
    changed_by  INT UNSIGNED NOT NULL,
    changed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_osc_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_osc_changed_by FOREIGN KEY (changed_by) REFERENCES users(id),
    INDEX idx_osc_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Requirements & the 12-stage pipeline
-- ---------------------------------------------------------------------------

CREATE TABLE requirements (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        INT UNSIGNED NOT NULL,
    description     TEXT NOT NULL,
    document_ref    VARCHAR(255),
    version         INT UNSIGNED NOT NULL DEFAULT 1,
    approved_by     INT UNSIGNED NULL,
    approved_at     TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_requirements_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_requirements_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_requirements_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stage 1 normally requires a URS (User Requirement Specification) document
-- on file (StageCompletionEvaluator) — this is the sole escape hatch, one
-- per order, and only the Company Owner (never Sales Manager/PC) can grant
-- it, unlike stage_exceptions below which Sales Manager can also approve.
CREATE TABLE urs_exemptions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        INT UNSIGNED NOT NULL UNIQUE,
    reason          TEXT NOT NULL,
    approved_by     INT UNSIGNED NOT NULL,
    approved_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_urs_exemption_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_urs_exemption_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Master lookup: the fixed 12 stages, seeded below.
CREATE TABLE stages (
    id          TINYINT UNSIGNED PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    sequence    TINYINT UNSIGNED NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO stages (id, name, sequence) VALUES
    (1,  'Requirements captured', 1),
    (2,  'Order placed', 2),
    (3,  'Machine manufacturing progress', 3),
    (4,  'Machine testing material coordination', 4),
    (5,  'Machine FAT readiness / FAT execution', 5),
    (6,  'Shipment coordination', 6),
    (7,  'Import clearance in Pakistan', 7),
    (8,  'Delivery to customer', 8),
    (9,  'Installation at customer site', 9),
    (10, 'SAT (Site Acceptance Test)', 10),
    (11, 'Training', 11),
    (12, 'Handover', 12);

CREATE TABLE order_stages (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id                INT UNSIGNED NOT NULL,
    stage_id                TINYINT UNSIGNED NOT NULL,
    status                  ENUM('not_started','in_progress','completed','delayed','blocked') NOT NULL DEFAULT 'not_started',
    -- immutable once set — the commitment the plan is built back from
    original_planned_start  DATE NULL,
    original_planned_end    DATE NULL,
    -- current agreed plan — mutable, every change logged in commitment_changes
    planned_start           DATE NULL,
    planned_end             DATE NULL,
    actual_start            DATE NULL,
    actual_end              DATE NULL,
    updated_by              INT UNSIGNED NULL,
    notes                   TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_stages_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_order_stages_stage FOREIGN KEY (stage_id) REFERENCES stages(id),
    CONSTRAINT fk_order_stages_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    UNIQUE KEY uq_order_stage (order_id, stage_id),
    INDEX idx_order_stages_status (status),
    INDEX idx_order_stages_planned_end (planned_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only audit trail for date-commitment changes.
CREATE TABLE commitment_changes (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id            INT UNSIGNED NOT NULL,
    order_stage_id      INT UNSIGNED NULL,  -- NULL when the change is order-level (target_handover_date)
    field_name          VARCHAR(100) NOT NULL,
    old_value           VARCHAR(255),
    new_value           VARCHAR(255),
    reason              TEXT NOT NULL,
    changed_by          INT UNSIGNED NOT NULL,
    -- required (Sales Manager/Owner) when customer_informed=true or field_name='target_handover_date'
    approved_by         INT UNSIGNED NULL,
    customer_informed   BOOLEAN NOT NULL DEFAULT FALSE,
    changed_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cc_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_cc_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_cc_changed_by FOREIGN KEY (changed_by) REFERENCES users(id),
    CONSTRAINT fk_cc_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_cc_order (order_id),
    INDEX idx_cc_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Never overrides a fail or an open critical punch item — enforced in the API.
CREATE TABLE stage_exceptions (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id          INT UNSIGNED NOT NULL,
    prerequisite_stage_id   TINYINT UNSIGNED NOT NULL,
    applies_to              ENUM('open_minor_items','procedural_delay') NOT NULL,
    reason                  TEXT NOT NULL,
    approved_by             INT UNSIGNED NOT NULL,  -- Sales Manager or Company Owner only
    approved_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_se_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_se_prerequisite_stage FOREIGN KEY (prerequisite_stage_id) REFERENCES stages(id),
    CONSTRAINT fk_se_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_se_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE manufacturing_milestones (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id  INT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    sequence        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    planned_date    DATE NULL,
    actual_date     DATE NULL,
    status          ENUM('pending','done') NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_mm_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    INDEX idx_mm_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Documents (needed before engineer_reports/fat_sat_records reference it)
-- ---------------------------------------------------------------------------

CREATE TABLE documents (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id              INT UNSIGNED NULL,   -- one of project_id/order_id set
    order_id                INT UNSIGNED NULL,
    order_stage_id          INT UNSIGNED NULL,
    -- ties FAT/SAT photos/video to the exact attempt they document (retests
    -- don't inherit the prior attempt's media). FK added below, after
    -- fat_sat_records exists — the two tables reference each other.
    fat_sat_record_id       INT UNSIGNED NULL,
    type                    VARCHAR(50) NOT NULL,  -- e.g. PO, FAT_report, SAT_report, BOL, handover_certificate
    -- 'google_drive' for FAT/SAT photo/video (file_path = Drive file ID);
    -- 'local' for everything else (file_path = local relative path);
    -- 'link' for a plain external URL (file_path = the URL itself) — e.g. a
    -- FAT/SAT video someone already uploaded to YouTube or elsewhere,
    -- referenced rather than re-hosted (docs/ROADMAP.md).
    storage_type            ENUM('local','google_drive','link') NOT NULL DEFAULT 'local',
    file_path               VARCHAR(500) NOT NULL,
    uploaded_by             INT UNSIGNED NOT NULL,
    visibility              ENUM('internal','supplier','customer','shared') NOT NULL DEFAULT 'internal',
    -- required when project_id is set, order_id is NULL, and visibility='supplier'
    -- (a project-level item shared with one specific supplier, never all of them)
    shared_with_supplier_id INT UNSIGNED NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_documents_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_documents_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_documents_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id),
    CONSTRAINT fk_documents_shared_supplier FOREIGN KEY (shared_with_supplier_id) REFERENCES suppliers(id),
    INDEX idx_documents_project (project_id),
    INDEX idx_documents_order (order_id),
    INDEX idx_documents_order_stage (order_stage_id),
    INDEX idx_documents_fat_sat_record (fat_sat_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Engineer-submitted evidence: installation, handover-readiness, FAT/SAT, training
-- ---------------------------------------------------------------------------

CREATE TABLE engineer_reports (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id      INT UNSIGNED NOT NULL,
    type                ENUM('installation','handover_readiness') NOT NULL,
    completed_by        INT UNSIGNED NOT NULL,
    completion_status   ENUM('complete','incomplete') NOT NULL,
    outstanding_issues  TEXT,
    report_document_id  INT UNSIGNED NULL,
    notes               TEXT,
    submitted_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_er_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_er_completed_by FOREIGN KEY (completed_by) REFERENCES users(id),
    CONSTRAINT fk_er_report_document FOREIGN KEY (report_document_id) REFERENCES documents(id),
    INDEX idx_er_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE fat_sat_records (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id      INT UNSIGNED NOT NULL,
    type                ENUM('FAT','SAT') NOT NULL,
    scheduled_date      DATE NULL,
    actual_date         DATE NULL,
    result              ENUM('pass','fail','conditional_pass') NULL,
    -- set when a retest replaces this record; an acceptance tied to a
    -- superseded record no longer satisfies stage completion (enforced in API)
    superseded_by       INT UNSIGNED NULL,
    report_document_id  INT UNSIGNED NULL,
    notes               TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fsr_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_fsr_superseded_by FOREIGN KEY (superseded_by) REFERENCES fat_sat_records(id),
    CONSTRAINT fk_fsr_report_document FOREIGN KEY (report_document_id) REFERENCES documents(id),
    INDEX idx_fsr_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE documents
    ADD CONSTRAINT fk_documents_fat_sat_record FOREIGN KEY (fat_sat_record_id) REFERENCES fat_sat_records(id);

CREATE TABLE punch_list_items (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    fat_sat_record_id       INT UNSIGNED NOT NULL,
    description             TEXT NOT NULL,
    severity                ENUM('critical','minor') NOT NULL,
    assigned_to             INT UNSIGNED NULL,
    target_resolution_date  DATE NULL,
    raised_by               INT UNSIGNED NOT NULL,
    status                  ENUM('open','resolved') NOT NULL DEFAULT 'open',
    resolved_at             TIMESTAMP NULL,
    resolved_by             INT UNSIGNED NULL,
    verified_by             INT UNSIGNED NULL,
    verified_at             TIMESTAMP NULL,
    -- a minor item explicitly allowed to remain open after handover
    carries_past_handover   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pli_fat_sat_record FOREIGN KEY (fat_sat_record_id) REFERENCES fat_sat_records(id),
    CONSTRAINT fk_pli_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_pli_raised_by FOREIGN KEY (raised_by) REFERENCES users(id),
    CONSTRAINT fk_pli_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id),
    CONSTRAINT fk_pli_verified_by FOREIGN KEY (verified_by) REFERENCES users(id),
    INDEX idx_pli_fat_sat_record (fat_sat_record_id),
    INDEX idx_pli_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE training_records (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id          INT UNSIGNED NOT NULL,
    scheduled_date          DATE NULL,
    actual_date             DATE NULL,
    attendees               TEXT,
    materials_provided      TEXT,
    report_document_id      INT UNSIGNED NULL,
    notes                   TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tr_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_tr_report_document FOREIGN KEY (report_document_id) REFERENCES documents(id),
    INDEX idx_tr_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Structured per-person detail, alongside training_records.attendees (kept
-- as a freeform summary) — the customer's own staff who need to be
-- reachable after handover, not just a name in a paragraph.
CREATE TABLE training_attendees (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    training_record_id INT UNSIGNED NOT NULL,
    name                VARCHAR(255) NOT NULL,
    department          VARCHAR(255) NULL,
    designation         VARCHAR(255) NULL,
    phone               VARCHAR(50) NULL,
    email               VARCHAR(255) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ta_training_record FOREIGN KEY (training_record_id) REFERENCES training_records(id),
    INDEX idx_ta_training_record (training_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only: a deliberate, auditable sign-off, tied to the exact record it covers.
CREATE TABLE acceptances (
    id                                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id                              INT UNSIGNED NOT NULL,
    target_record_type                          ENUM('fat_sat_record','training_record','engineer_report') NOT NULL,
    target_record_id                            INT UNSIGNED NOT NULL,
    type                                        ENUM('fat_conditional','sat_result','training_ack','handover_confirmation') NOT NULL,
    accepted_by_type                            ENUM('customer','sales_manager') NOT NULL,
    accepted_by_user_id                         INT UNSIGNED NOT NULL,
    -- required when accepted_by_type='sales_manager' AND type IN ('sat_result','handover_confirmation')
    customer_authorization_evidence_document_id INT UNSIGNED NULL,
    -- true when the customer accepted directly, or a sales_manager acceptance
    -- carries valid customer_authorization_evidence_document_id
    constitutes_customer_acceptance             BOOLEAN NOT NULL DEFAULT FALSE,
    conditions_notes                            TEXT,
    accepted_at                                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acc_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_acc_accepted_by FOREIGN KEY (accepted_by_user_id) REFERENCES users(id),
    CONSTRAINT fk_acc_evidence_document FOREIGN KEY (customer_authorization_evidence_document_id) REFERENCES documents(id),
    INDEX idx_acc_order_stage (order_stage_id),
    INDEX idx_acc_target (target_record_type, target_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE blockers (
    id                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id              INT UNSIGNED NOT NULL,
    description                 TEXT NOT NULL,
    responsible_party           ENUM('bli_internal','supplier','customer','third_party') NOT NULL,
    responsible_party_detail    VARCHAR(255),
    next_action                 TEXT NOT NULL,
    next_review_date            DATE NOT NULL,
    raised_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    raised_by                   INT UNSIGNED NOT NULL,
    resolved_at                 TIMESTAMP NULL,
    resolved_by                 INT UNSIGNED NULL,
    CONSTRAINT fk_blockers_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_blockers_raised_by FOREIGN KEY (raised_by) REFERENCES users(id),
    CONSTRAINT fk_blockers_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id),
    INDEX idx_blockers_order_stage (order_stage_id),
    INDEX idx_blockers_open (resolved_at, next_review_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Shipments & customer-side import/delivery tracking
-- ---------------------------------------------------------------------------

CREATE TABLE shipments (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id                INT UNSIGNED NOT NULL,
    carrier                 VARCHAR(255),
    mode                    ENUM('sea','air','road') NULL,
    port_of_loading         VARCHAR(255),
    port_of_discharge       VARCHAR(255),
    bl_awb_number           VARCHAR(100),
    etd                     DATE NULL,
    eta                     DATE NULL,
    -- required before stage 6 can be marked completed — a booking alone is not dispatch
    actual_dispatch_date    DATE NULL,
    customs_status          VARCHAR(100),
    notes                   TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_shipments_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per order_stage (stage 7 and stage 8 tracked separately —
-- each has its own document chase and follow-up cadence).
CREATE TABLE customer_import_tracking (
    id                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_stage_id              INT UNSIGNED NOT NULL UNIQUE,
    customer_contact_name       VARCHAR(255),
    customer_contact_email      VARCHAR(255),
    customer_contact_phone      VARCHAR(50),
    latest_status               VARCHAR(100),
    outstanding_documents       TEXT,
    expected_date               DATE NULL,
    next_follow_up_date         DATE NULL,
    import_manager_engaged_at   TIMESTAMP NULL,
    import_manager_disengaged_at TIMESTAMP NULL,
    notes                       TEXT,
    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cit_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only history, so latest_status changes don't overwrite the trail.
CREATE TABLE customer_import_tracking_updates (
    id                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_import_tracking_id INT UNSIGNED NOT NULL,
    status                      VARCHAR(100) NOT NULL,
    note                        TEXT,
    reported_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_by                 INT UNSIGNED NOT NULL,
    CONSTRAINT fk_citu_tracking FOREIGN KEY (customer_import_tracking_id) REFERENCES customer_import_tracking(id),
    CONSTRAINT fk_citu_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id),
    INDEX idx_citu_tracking (customer_import_tracking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Comments (channel-scoped)
-- ---------------------------------------------------------------------------

CREATE TABLE comments (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id              INT UNSIGNED NULL,
    order_id                INT UNSIGNED NULL,
    order_stage_id          INT UNSIGNED NULL,
    channel                 ENUM('internal','customer','supplier') NOT NULL DEFAULT 'internal',
    -- required when project_id is set, order_id is NULL, and channel='supplier'
    shared_with_supplier_id INT UNSIGNED NULL,
    user_id                 INT UNSIGNED NOT NULL,
    message                 TEXT NOT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comments_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_comments_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_comments_order_stage FOREIGN KEY (order_stage_id) REFERENCES order_stages(id),
    CONSTRAINT fk_comments_shared_supplier FOREIGN KEY (shared_with_supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_comments_project (project_id),
    INDEX idx_comments_order (order_id),
    INDEX idx_comments_order_stage (order_stage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Post-handover service
-- ---------------------------------------------------------------------------

CREATE TABLE amc_contracts (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        INT UNSIGNED NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    frequency       ENUM('quarterly','biannual','annual') NOT NULL,
    coverage_terms  TEXT,
    notes           TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_amc_contracts_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_amc_contracts_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE amc_visits (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    amc_contract_id     INT UNSIGNED NOT NULL,
    scheduled_date      DATE NOT NULL,
    actual_date         DATE NULL,
    assigned_engineer_id INT UNSIGNED NOT NULL,
    notes               TEXT,
    CONSTRAINT fk_amc_visits_contract FOREIGN KEY (amc_contract_id) REFERENCES amc_contracts(id),
    CONSTRAINT fk_amc_visits_engineer FOREIGN KEY (assigned_engineer_id) REFERENCES users(id),
    INDEX idx_amc_visits_contract (amc_contract_id),
    INDEX idx_amc_visits_scheduled (scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE service_tickets (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id                INT UNSIGNED NOT NULL,
    type                    ENUM('warranty_claim','amc_visit','complaint','other') NOT NULL,
    severity                ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    response_target_hours   SMALLINT UNSIGNED NOT NULL,
    resolution_target_hours SMALLINT UNSIGNED NOT NULL,
    opened_by               INT UNSIGNED NOT NULL,
    assigned_engineer_id    INT UNSIGNED NULL,
    status                  ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
    closure_type            ENUM('customer_confirmed','auto_closed_no_response') NULL,
    description             TEXT NOT NULL,
    resolution_notes        TEXT,
    opened_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    first_response_at       TIMESTAMP NULL,
    resolved_at             TIMESTAMP NULL,
    resolved_by             INT UNSIGNED NULL,
    closed_at               TIMESTAMP NULL,
    closed_by               INT UNSIGNED NULL,
    CONSTRAINT fk_st_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_st_opened_by FOREIGN KEY (opened_by) REFERENCES users(id),
    CONSTRAINT fk_st_assigned_engineer FOREIGN KEY (assigned_engineer_id) REFERENCES users(id),
    CONSTRAINT fk_st_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id),
    CONSTRAINT fk_st_closed_by FOREIGN KEY (closed_by) REFERENCES users(id),
    INDEX idx_st_order (order_id),
    INDEX idx_st_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Assignment, activity, notifications, AI
-- ---------------------------------------------------------------------------

-- Append-only: never a silent overwrite of who's responsible for what.
CREATE TABLE assignment_history (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id      INT UNSIGNED NULL,
    order_id        INT UNSIGNED NULL,
    role            ENUM('sales_manager','project_coordinator','installation_engineer') NOT NULL,
    previous_user_id INT UNSIGNED NULL,
    new_user_id     INT UNSIGNED NOT NULL,
    reason          ENUM('temporary_cover','permanent_reassignment') NOT NULL,
    cover_end_date  DATE NULL,
    changed_by      INT UNSIGNED NOT NULL,
    changed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ah_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_ah_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_ah_previous_user FOREIGN KEY (previous_user_id) REFERENCES users(id),
    CONSTRAINT fk_ah_new_user FOREIGN KEY (new_user_id) REFERENCES users(id),
    CONSTRAINT fk_ah_changed_by FOREIGN KEY (changed_by) REFERENCES users(id),
    INDEX idx_ah_project (project_id),
    INDEX idx_ah_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Generic audit trail for lower-stakes mutable writes (order_stages status
-- transitions, milestone edits) — commitment_changes/assignment_history
-- exist separately because they carry extra fields (reason, approver).
CREATE TABLE activity_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id    INT UNSIGNED NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   INT UNSIGNED NOT NULL,
    action      VARCHAR(100) NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    user_id     INT UNSIGNED NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_log_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_activity_log_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_activity_log_order (order_id),
    INDEX idx_activity_log_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    order_id    INT UNSIGNED NULL,
    type        VARCHAR(100) NOT NULL,
    message     TEXT NOT NULL,
    read_at     TIMESTAMP NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_notifications_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_notifications_user (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ai_reports (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        INT UNSIGNED NULL,  -- set for order-level risk advisory / follow-up drafts
    -- set for a project-level status report (§10) — distinct from order_id
    -- (one order) and from "both NULL" (portfolio-wide, Owner-only): a
    -- project status report is scoped to that project's Sales Manager/PC,
    -- and without its own column it would either leak into the portfolio
    -- bucket or have no way to be scoped to the right people at all.
    project_id      INT UNSIGNED NULL,
    type            VARCHAR(100) NOT NULL,
    provider        ENUM('claude','gemini','chatgpt') NOT NULL,
    prompt          TEXT NOT NULL,
    response        TEXT NOT NULL,
    status          ENUM('new','acknowledged','dismissed','actioned') NOT NULL DEFAULT 'new',
    acknowledged_by INT UNSIGNED NULL,
    acknowledged_at TIMESTAMP NULL,
    action_notes    TEXT,
    created_by      INT UNSIGNED NULL,  -- NULL when system-generated (cron/digest)
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_reports_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_ai_reports_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_ai_reports_acknowledged_by FOREIGN KEY (acknowledged_by) REFERENCES users(id),
    CONSTRAINT fk_ai_reports_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_ai_reports_order (order_id),
    INDEX idx_ai_reports_project (project_id),
    INDEX idx_ai_reports_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
