# System Design

## 1. Purpose

Track an order/project from customer requirement to handover, across three
audiences with different access levels:

- **Internal team** — full visibility and control (Admin, Project Manager,
  Procurement, Logistics Coordinator, QA/FAT Engineer, Installation Engineer).
- **Suppliers** — external login, scoped to only the order(s) and stage(s)
  they are assigned to (processing, manufacturing, testing material, FAT).
- **Customers** — external login, scoped to only their own order(s):
  read-only progress view, shared documents, and SAT sign-off.

Because two of the three audiences are outside the company, **data isolation
is a first-class requirement**, not an afterthought: a customer must never
see another customer's order, and a supplier must never see another
supplier's pricing, schedule, or documents.

## 2. Workflow — the order pipeline

Every order moves through a fixed sequence of stages. Each stage has its own
owner, planned vs. actual dates, status, and associated documents.

| # | Stage | Typical owner |
|---|-------|---------------|
| 1 | Requirements captured | Project Manager |
| 2 | Order placed (PO issued) | Procurement |
| 3 | Import of raw material/components (supplier side) | Supplier |
| 4 | Processing & manufacturing (supplier site) | Supplier |
| 5 | Testing material supplied | Procurement / Supplier |
| 6 | FAT (Factory Acceptance Test) | QA/FAT Engineer + Supplier |
| 7 | Shipment coordination | Logistics Coordinator |
| 8 | Import clearance in Pakistan | Logistics Coordinator |
| 9 | Delivery to customer | Logistics Coordinator |
| 10 | Installation at customer site | Installation Engineer |
| 11 | SAT (Site Acceptance Test) | Installation Engineer + Customer |
| 12 | Training | Installation Engineer |
| 13 | Handover | Project Manager + Customer |

Stage status: `not_started`, `in_progress`, `completed`, `delayed`, `blocked`.
Stages are sequential by default but the model allows overlap (e.g., shipment
coordination can start before FAT fully closes) — enforced by planning, not
hard-coded in the database.

## 3. Core data model

```
companies         (id, name, type[internal|supplier|customer], contact_info)
users             (id, company_id, name, email, password_hash, role, status)
orders            (id, order_number, customer_company_id, title, description,
                   contract_value, currency, start_date, target_handover_date,
                   status, created_by)
order_line_items  (id, order_id, item_name, spec, quantity)
requirements      (id, order_id, description, document_ref, version,
                   approved_by, approved_at)
stages            (id, name, sequence)                      -- master lookup
order_stages      (id, order_id, stage_id, status,
                   planned_start, planned_end, actual_start, actual_end,
                   owner_role, owner_user_id, supplier_company_id, notes)
documents         (id, order_id, order_stage_id, type, file_path,
                   uploaded_by, visibility[internal|supplier|customer|shared])
shipments         (id, order_id, carrier, mode[sea|air|road],
                   port_of_loading, port_of_discharge, bl_awb_number,
                   etd, eta, customs_status, notes)
activity_log      (id, order_id, order_stage_id, user_id, message, created_at)
notifications     (id, user_id, order_id, type, message, read_at, created_at)
ai_reports        (id, order_id, type, provider, prompt, response,
                   created_by, created_at)
```

`documents.visibility` is enforced on every read — a customer-facing endpoint
never returns a document tagged `internal`, regardless of what the client
requests.

## 4. Roles & permissions

| Role | Scope |
|------|-------|
| Admin | Full access, user management |
| Project Manager | All orders, all stages |
| Procurement | Ordering, requirements, testing material stages |
| Logistics Coordinator | Shipment, customs, delivery stages |
| QA/FAT Engineer | FAT stage, test records |
| Installation Engineer | Installation, SAT, training, handover stages |
| Supplier (external) | Read/update only their assigned order(s) + stages 3–6 |
| Customer (external) | Read-only on their own order(s); can act only on SAT sign-off and view shared documents |

Every API request is authorized by `(user.role, user.company_id)` against the
`order.customer_company_id` or `order_stage.supplier_company_id` — never by
trusting an order ID passed from the client alone.

## 5. AI integration layer

A provider-agnostic service so the system can call **Claude, Gemini, or
ChatGPT** interchangeably:

```
AiAdvisorService
├── ClaudeAdapter
├── GeminiAdapter
└── ChatGptAdapter
```

Use cases:
- **Status reports** — narrative summary of an order's progress on demand.
- **Risk advisory** — flag stages at risk (e.g., FAT scheduled but testing
  material not yet confirmed shipped).
- **Follow-up drafting** — draft a follow-up message to a supplier/customer
  based on current stage status.
- **Monitoring digest** — scheduled (cron) scan across active orders,
  emailing a daily digest of overdue/at-risk milestones.

Rules:
- API keys live server-side only (`.env`, outside the web root) — never sent
  to the frontend, never accessible to supplier/customer sessions.
- Every AI call is scoped to data the *requesting user* is already allowed to
  see — the AI layer must not become a side channel that leaks another
  customer's order into a summary.
- AI features are on-demand or scheduled batch, not triggered per page load
  (cost control).

## 6. Tech stack

- **Backend**: PHP 8 + PDO/MySQL, REST API (JSON) — same pattern as the
  team's housekeeping-system project, for consistency and Bluehost shared
  hosting compatibility.
- **Frontend**: SPA (Vue or React) built to static assets, served from the
  same cPanel account, calling the REST API. Role-based app shells for
  internal / supplier / customer.
- **Auth**: JWT (short-lived access + refresh token), `password_hash()` for
  storage.
- **File storage**: uploaded documents stored outside the public web root,
  served only through an authenticated PHP endpoint that checks `visibility`
  and the requester's company — never as a direct static link.
- **Email**: PHPMailer via Bluehost SMTP for milestone alerts and the AI
  monitoring digest.
- **Scheduling**: Bluehost cPanel cron jobs (nightly digest, overdue checks).

## 7. Security notes

- Force HTTPS (Bluehost's free SSL) — credentials and commercial
  (pricing/customs) data will transit this system.
- Every external-facing endpoint (supplier/customer) re-checks company
  ownership server-side on every request, not just at login.
- Login rate-limiting/lockout on the externally exposed portals.
- Regular DB backups (cPanel automated backup + periodic manual dump), since
  this becomes the system of record for contractual milestones (SAT
  sign-off, handover).
