# System Design

## 1. Purpose

Track an order/project from customer requirement to post-handover service,
for **Business Links International (BLI)**, across two kinds of audiences:

- **Internal team** — full visibility, with roles split by function (see §5).
  BLI has multiple people in the same role (several Project Coordinators,
  several Sales Managers, etc.) — each person has **one login**, and that
  login sees every order they're assigned to, whatever the role.
- **External parties** — observer + commenter only, no data entry:
  - **Customer** — one login *per project*. A customer with two projects
    with BLI gets two separate logins.
  - **Supplier** — one login *per supplier company*, but scoped to **all**
    projects that company supplies to BLI, not just one.

Because external logins exist, **data isolation is a first-class
requirement**: a customer must never see another customer's order, and a
supplier must never see another supplier's pricing, schedule, or documents
for an order it isn't part of. Customer access is bounded by a single
`scope_order_id`; supplier access is bounded by `supplier_id` matched
against every order that supplier is linked to.

## 2. Workflow — the order pipeline

Every order moves through a fixed sequence of stages, followed by an
open-ended post-handover service phase. **The Project Coordinator is the
single point of data entry for all stages** — other internal roles advise,
execute physically, or view, but the system-of-record update goes through
the Coordinator (see §5 for exactly who does what).

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

## 3. Stage-specific detail, targets & deadline alerts

Every stage carries the common fields on `order_stages` (status,
planned/actual start & end, notes — see §6). Three stages need more than
that, plus every order needs deadline monitoring:

### 3.1 Target dates — set manually per order

Machine type and supplier lead times vary too much for a fixed template, so
the **Project Coordinator sets `planned_start`/`planned_end` for every stage
by hand** when planning the order (informed by the supplier's quote/lead
time, shipping transit time, etc.). `orders.target_handover_date` is the
overall commitment the whole plan is built back from.

### 3.2 Manufacturing progress (stage 3) — milestone checklist

Rather than one status field, manufacturing progress is a checklist the
Project Coordinator builds per order (machines differ, so this isn't a
fixed global template — typical items: design/drawing approval, fabrication,
assembly, painting/finishing, packing & ready for FAT):

```
manufacturing_milestones (id, order_stage_id, name, sequence,
                           planned_date, actual_date,
                           status[pending|done], notes)
```

Stage 3's own status/dates on `order_stages` still exist (start = first
milestone starts, end = last milestone done) so it fits the same deadline
logic as every other stage, but the milestone list is what gives visibility
into *where exactly* manufacturing stands.

### 3.3 FAT & SAT (stages 5 and 10) — result + punch list + report

FAT and SAT are structurally the same kind of event (a witnessed test with
a pass/fail outcome and a list of issues to close out), so they share one
table, disambiguated by `type`:

```
fat_sat_records   (id, order_stage_id, type[FAT|SAT], scheduled_date,
                    actual_date, result[pass|fail|conditional_pass],
                    report_document_id, notes)

punch_list_items  (id, fat_sat_record_id, description, raised_by,
                    status[open|resolved], resolved_at, resolved_by)
```

A stage isn't marked `completed` while it has open punch-list items with a
`fail` or `conditional_pass` result — enforced in the API, not just the UI.
`report_document_id` links to the uploaded FAT/SAT report in `documents`.
For stage 10 (SAT), the customer's confirmation is recorded as a comment
tied to this record — that's their sign-off action (§5, Customer row).

### 3.4 Deadline & at-risk alerts — automatic, both directions

A daily cron job (`check_stage_deadlines.php`) scans all `order_stages`
where `status` is `not_started` or `in_progress` (never `completed` or
manually `blocked`):

- **Early warning** — if `planned_end` is within **3 days** (configurable)
  and the stage hasn't started or isn't finished, create an "at risk"
  notification. Doesn't change status.
- **Auto-overdue** — the day `planned_end` passes with the stage still not
  `completed`, the job sets `status = 'delayed'` and creates an overdue
  notification.

Both notification types go to the order's assigned **Project Coordinator**
and to **every Company Owner**. The same check runs against
`orders.target_handover_date` at the whole-order level, for the Company
Owner portfolio dashboard. `amc_schedules.next_due_date` gets the same
early-warning treatment (§4).

## 4. Post-handover service module

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

## 5. Roles & permissions

| Role | Assigned how | Scope |
|------|--------------|-------|
| **Company Owner** | One login per person; role-based, not per-order | Read access to **all** orders and financials, portfolio-level view (active orders, delays, open service tickets). No data entry. |
| **Project Coordinator** | One login per person; assigned to N orders as `project_coordinator_id` | Full read/write on every order they're assigned to: creates the order, updates all 12 stages + documents + shipments. The operational hub. BLI has multiple PCs — each order has exactly one, each PC can hold many orders. |
| **Sales Manager** | One login per person; assigned to N orders as `sales_manager_id` | Read + comment on every order they're assigned to; sees contract/customer info; notified on milestones and delays for those customers. BLI has multiple Sales Managers, same many-orders-per-person model. |
| **Import Manager** | One login per person; global advisory role (not tied to specific orders) | Read access to all orders; comments on stages 6–8 (shipment, customs, delivery) jointly with the assigned Project Coordinator, only when the customer's import team needs input. No stage-status edit rights. |
| **Installation & Service Engineer** | One login per person; assigned to N orders as `installation_engineer_id` | Full read/write on stages 9–12 for every order they're assigned to, plus all service tickets/AMC schedules for those orders after handover. |
| **Supplier** (external) | One login per supplier company | Observer + comment only, across **every** order linked to that supplier (`orders.supplier_id`). Sees stages/documents relevant to their side (3–6: manufacturing, testing material, FAT, shipment coordination) on each of those orders, not commercial terms with the customer. |
| **Customer** (external) | One login per project | Observer + comment only, on the **one** order they're linked to (`scope_order_id`). Sees overall progress + shared documents, can raise a service ticket post-handover, and confirms SAT sign-off as a specific comment/action. |

Every API request is authorized server-side against the requesting user's
actual scope — never by trusting an order ID passed from the client alone:
- Company Owner / Import Manager → role check only, no order-level filter.
- Project Coordinator / Sales Manager / Installation & Service Engineer →
  `order.project_coordinator_id` / `sales_manager_id` / `installation_engineer_id`
  must equal the requesting user's id.
- Supplier → `order.supplier_id` must equal the requesting user's `supplier_id`.
- Customer → the order id must equal the requesting user's `scope_order_id`.

## 6. Core data model

```
suppliers         (id, name, contact_email, contact_phone)
                   -- one row per supplier company; a supplier login is a
                   -- `users` row with role=supplier and this supplier_id

users             (id, name, email, password_hash, role, status,
                   scope_order_id,   -- set only for customer logins (their one project)
                   supplier_id)      -- set only for supplier logins (their company)

orders            (id, order_number, customer_name, customer_contact,
                   supplier_id, title, description, contract_value, currency,
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

manufacturing_milestones (id, order_stage_id, name, sequence,
                   planned_date, actual_date, status, notes)

fat_sat_records   (id, order_stage_id, type, scheduled_date, actual_date,
                   result, report_document_id, notes)

punch_list_items  (id, fat_sat_record_id, description, raised_by,
                   status, resolved_at, resolved_by)

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

Note: `orders.customer_name`/`customer_contact` stay as plain fields rather
than a `customers` table, since customer access is genuinely per-project —
there's no reusable customer login to link to. `suppliers` gets a real table
because supplier access spans multiple orders and is the same login every
time. If BLI later wants one login to cover a repeat customer's multiple
projects too, add a `customers` table the same way (see ROADMAP).

`documents.visibility` is enforced on every read — a customer- or
supplier-facing endpoint never returns a document tagged `internal`,
regardless of what the client requests.

## 7. AI integration layer

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
  Import Manager. Complements, not replaces, the deterministic deadline
  alerts in §3.4 — the cron job always fires on dates; the AI layer adds
  judgment calls a date threshold can't (e.g., reading punch-list severity).
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

## 8. Tech stack

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
- **Scheduling**: Bluehost cPanel cron jobs — `check_stage_deadlines.php`
  (daily, §3.4), AI monitoring digest, AMC due-date reminders.

## 9. Security notes

- Force HTTPS (Bluehost's free SSL) — credentials and commercial
  (pricing/customs) data will transit this system.
- Every external-facing endpoint re-checks the requester's actual scope
  server-side on every request, not just at login: `scope_order_id` for a
  customer, `supplier_id` for a supplier.
- Login rate-limiting/lockout on the externally exposed portals.
- Regular DB backups (cPanel automated backup + periodic manual dump), since
  this becomes the system of record for contractual milestones (SAT
  sign-off, handover) and service history.
