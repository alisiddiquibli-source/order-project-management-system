# System Design

## 1. Purpose

Track an order/project from customer requirement to post-handover service,
for **Business Links International (BLI)**, across two kinds of audiences:

- **Internal team** — full visibility, with roles split by function (see §4).
- **External parties** — one supplier login and one customer login *per
  project*, both observer + commenter only (no data entry).

Because external logins exist, **data isolation is a first-class
requirement**: a customer must never see another customer's order, and a
supplier must never see another supplier's pricing, schedule, or documents.
Since each external login is scoped to a single project, this is simpler to
enforce than a multi-project external account would be — the login's
`scope_order_id` is the entire access boundary.

## 2. Workflow — the order pipeline

Every order moves through a fixed sequence of stages, followed by an
open-ended post-handover service phase. **The Project Coordinator is the
single point of data entry for all stages** — other internal roles advise,
execute physically, or view, but the system-of-record update goes through
the Coordinator (see §4 for exactly who does what).

| # | Stage | Executed by (real world) | Entered/updated in system by |
|---|-------|---------------------------|-------------------------------|
| 1 | Requirements captured | Sales Manager + customer | Project Coordinator |
| 2 | Order placed (PO issued) | Project Coordinator | Project Coordinator |
| 3 | Machine manufacturing progress (supplier site) | Supplier | Project Coordinator |
| 4 | Machine testing material coordination | Project Coordinator / Supplier | Project Coordinator |
| 5 | Machine FAT readiness / FAT execution | Supplier, witnessed remotely/on-site | Project Coordinator |
| 6 | Shipment coordination | Project Coordinator | Project Coordinator |
| 7 | Import clearance in Pakistan | **Customer's own import team** — BLI only coordinates | Project Coordinator |
| 8 | Delivery to customer | **Customer's own import team** — BLI only coordinates | Project Coordinator |
| 9 | Installation at customer site | Installation & Service Engineer | Project Coordinator |
| 10 | SAT (Site Acceptance Test) | Installation & Service Engineer + customer | Project Coordinator |
| 11 | Training | Installation & Service Engineer | Project Coordinator |
| 12 | Handover | Project Coordinator + customer | Project Coordinator |
| — | **Post-handover service** (ongoing) | Installation & Service Engineer | Installation & Service Engineer |

BLI does not track the supplier's own raw-material import/procurement —
scope starts once the machine is in manufacturing at the supplier's site.
BLI also does not execute Pakistan customs clearance or final delivery
(stages 7–8) — that's the **customer's own import team's** job. BLI's role
there is coordination: the Project Coordinator stays the point of contact,
and the **Import Manager joins as an advisor alongside the Project
Coordinator only if the customer's import team asks for help** (e.g.,
document questions, HS code guidance) — not a standing responsibility on
every order. The system still tracks stage 7–8 status (so the pipeline view
stays complete), updated by the Project Coordinator based on what the
customer's team reports.

Stage status: `not_started`, `in_progress`, `completed`, `delayed`, `blocked`.
Stages are sequential by default but the model allows overlap — enforced by
planning, not hard-coded in the database.

## 3. Post-handover service module

Since Installation & Service Engineers cover ongoing service, not just the
installation event, the pipeline doesn't end at handover:

```
service_tickets  (id, order_id, type[warranty_claim|amc_visit|complaint|other],
                   opened_by, assigned_engineer_id, status[open|in_progress|resolved|closed],
                   description, resolution_notes, opened_at, resolved_at)
amc_schedules    (id, order_id, frequency[quarterly|biannual|annual],
                   next_due_date, last_visit_date, assigned_engineer_id, notes)
```

Customers can raise a ticket via their project login (observer + comment —
raising a ticket is a form of "comment," routed to a queue rather than a free
text thread). Company Owners see open/overdue tickets across the whole
portfolio.

## 4. Roles & permissions

| Role | Assigned how | Scope |
|------|--------------|-------|
| **Company Owner** | By role, not per-order | Read access to **all** orders and financials, portfolio-level view (active orders, delays, open service tickets). No data entry. |
| **Project Coordinator** | Assigned per order (1 per order) | Full read/write on their assigned order(s): creates the order, updates all 12 stages + documents + shipments. The operational hub. |
| **Sales Manager** | Assigned per order (their customer relationship) | Read + comment on their assigned order(s); sees contract/customer info; notified on milestones and delays affecting that customer. |
| **Import Manager** | Global advisory role (not per-order) | Read access to all orders; comments on stages 6–8 (shipment, customs, delivery) jointly with the Project Coordinator, only when the customer's import team needs input. No stage-status edit rights. |
| **Installation & Service Engineer** | Assigned per order | Full read/write on stages 9–12 for their assigned order(s), plus all service tickets/AMC schedules for those orders after handover. |
| **Supplier** (external) | One login per project | Observer + comment only, on the one project they're linked to. Sees stages/documents relevant to their side (3–6: manufacturing, testing material, FAT, shipment coordination), not commercial terms with the customer. |
| **Customer** (external) | One login per project | Observer + comment only, on the one project they're linked to. Sees overall progress + shared documents, can raise a service ticket post-handover, and confirms SAT sign-off as a specific comment/action. |

Every API request is authorized by `(user.role, user.assigned_order_ids or
scope_order_id)` — never by trusting an order ID passed from the client
alone. Company Owner and Import Manager are the two roles with cross-order
visibility; every other internal role and both external roles are scoped to
specific assigned orders.

## 5. Core data model

```
users             (id, name, email, password_hash, role, status,
                   scope_order_id)   -- set only for supplier/customer logins

orders            (id, order_number, customer_name, customer_contact,
                   title, description, contract_value, currency,
                   start_date, target_handover_date, status,
                   project_coordinator_id, sales_manager_id,
                   installation_engineer_id, created_by)

order_line_items  (id, order_id, item_name, spec, quantity)

requirements      (id, order_id, description, document_ref, version,
                   approved_by, approved_at)

stages            (id, name, sequence)                      -- master lookup

order_stages      (id, order_id, stage_id, status,
                   planned_start, planned_end, actual_start, actual_end,
                   updated_by, notes)

documents         (id, order_id, order_stage_id, type, file_path,
                   uploaded_by, visibility[internal|supplier|customer|shared])

shipments         (id, order_id, carrier, mode[sea|air|road],
                   port_of_loading, port_of_discharge, bl_awb_number,
                   etd, eta, customs_status, notes)

comments          (id, order_id, order_stage_id, user_id, message, created_at)
                   -- the observer/commenter mechanism for supplier & customer,
                   -- also used internally for discussion per stage

service_tickets   (id, order_id, type, opened_by, assigned_engineer_id,
                   status, description, resolution_notes, opened_at, resolved_at)

amc_schedules     (id, order_id, frequency, next_due_date, last_visit_date,
                   assigned_engineer_id, notes)

notifications     (id, user_id, order_id, type, message, read_at, created_at)

ai_reports        (id, order_id, type, provider, prompt, response,
                   created_by, created_at)
```

Note: `orders.customer_name`/`customer_contact` replace a `companies` table
for customers/suppliers, since external access is per-project rather than
per-company — there's no reusable "customer account" to link to. Supplier
identity is captured the same way against `order_stages`/comments context
rather than a shared `companies` row. If BLI later wants one login to cover
a repeat customer's multiple projects, this is the piece that would need to
change (see ROADMAP).

`documents.visibility` is enforced on every read — a customer- or
supplier-facing endpoint never returns a document tagged `internal`,
regardless of what the client requests.

## 6. AI integration layer

A provider-agnostic service so the system can call **Claude, Gemini, or
ChatGPT** interchangeably:

```
AiAdvisorService
├── ClaudeAdapter
├── GeminiAdapter
└── ChatGptAdapter
```

Use cases:
- **Status reports** — narrative summary of an order's progress on demand
  (useful for Company Owners' portfolio view and Sales Manager customer updates).
- **Risk advisory** — flag stages at risk (e.g., FAT readiness marked
  complete but shipment not yet booked) — surfaced to Project Coordinator and
  Import Manager.
- **Follow-up drafting** — draft a follow-up comment/message to a
  supplier/customer based on current stage status.
- **Monitoring digest** — scheduled (cron) scan across active orders and open
  service tickets, emailing a daily digest to Company Owners and assigned
  Coordinators.

Rules:
- API keys live server-side only (`.env`, outside the web root) — never sent
  to the frontend, never accessible to supplier/customer sessions.
- Every AI call is scoped to data the *requesting user* is already allowed to
  see — the AI layer must not become a side channel that leaks another
  customer's order into a summary.
- AI features are on-demand or scheduled batch, not triggered per page load
  (cost control).

## 7. Tech stack

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
  and the requester's scope — never as a direct static link.
- **Email**: PHPMailer via Bluehost SMTP for milestone alerts and the AI
  monitoring digest.
- **Scheduling**: Bluehost cPanel cron jobs (nightly digest, overdue checks,
  AMC due-date reminders).

## 8. Security notes

- Force HTTPS (Bluehost's free SSL) — credentials and commercial
  (pricing/customs) data will transit this system.
- Every external-facing endpoint (supplier/customer) re-checks
  `scope_order_id` server-side on every request, not just at login.
- Login rate-limiting/lockout on the externally exposed portals.
- Regular DB backups (cPanel automated backup + periodic manual dump), since
  this becomes the system of record for contractual milestones (SAT
  sign-off, handover) and service history.
