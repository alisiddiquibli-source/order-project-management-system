# Project Handover — Order & Project Lifecycle Management System
**Business Links International (BLI)**
Last updated: 2026-09-23

---

## 1. What This System Is

A full-stack web application for BLI to manage capital-equipment sales orders from Requirements Capture through to Handover & Training. Every order follows a fixed 12-stage pipeline. Multiple roles (Owner, Sales Manager, PC, Engineer, HR Manager, Customer, Supplier) have different visibility and write permissions at each stage.

**Live URL:** `https://m.businesslinks-pk.com`
**GitHub repo:** `https://github.com/alisiddiquibli-source/order-project-management-system`
**Branch:** `main`

---

## 2. Server Layout (Bluehost cPanel)

| What | Server path |
|---|---|
| cPanel account | `usineul0` |
| Frontend (React SPA) | `~/m.businesslinks-pk.com/` (index.html + assets/) |
| Backend (PHP API) | `~/m.businesslinks-pk.com/api/` |
| Backend source | `~/m.businesslinks-pk.com/api/src/` |
| Database | `usineul0_bli_orders` (MariaDB via cPanel) |
| **Not** the database | `usineul0_housekeeping_db` — separate, do not touch |

**No git auto-deploy is configured.** Backend PHP files must be uploaded manually via cPanel File Manager. Frontend is built locally (`npm run build`), zipped, and uploaded as a zip then extracted.

**Deployment convention (IMPORTANT for Chrome):**
- When Chrome reaches the Upload button in File Manager → click Upload, then STOP. Never try to pick the file from the OS dialog — the user selects it themselves from Downloads.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | PHP 8, PDO/MySQL, custom micro-router, JWT auth |
| Database | MariaDB (MySQL 8 compatible) |
| E2E tests | Playwright + Chromium (local only, not on server) |
| Auth | JWT (HS256), issued at `/api/login`, 8h expiry |

---

## 4. Repository File Map (Key Files)

```
order-project-management-system/
├── backend/
│   ├── database/
│   │   ├── schema.sql                      ← Full DB schema (source of truth)
│   │   └── migrations/
│   │       └── add_hr_manager_role.sql     ← Run on existing DBs to add hr_manager
│   └── src/
│       ├── Auth/
│       │   ├── Authenticator.php           ← JWT decode, requireAuth(), requireRole()
│       │   ├── Jwt.php
│       │   └── Scope.php                   ← SQL WHERE builder per role (CRITICAL)
│       ├── Config/Database.php             ← PDO singleton, reads DB_* env vars
│       ├── Domain/
│       │   ├── StageCompletionEvaluator.php ← 12-stage evidence gatekeeper (CRITICAL)
│       │   └── AcceptanceRules.php
│       ├── Http/
│       │   ├── OrderAccess.php             ← requireVisibleOrder() helper
│       │   ├── Request.php
│       │   ├── Response.php
│       │   └── Router.php
│       ├── Models/
│       │   ├── UserRepository.php          ← VALID_ROLES list lives here
│       │   ├── OrderRepository.php         ← redactForRole() for external roles
│       │   ├── ProjectRepository.php
│       │   ├── OrderStageRepository.php
│       │   └── [15 other repositories]
│       └── routes/
│           ├── health_and_auth.php         ← POST /api/login
│           ├── users.php                   ← User CRUD + password management
│           ├── projects.php                ← Project CRUD
│           ├── orders.php                  ← Order CRUD + status/date changes
│           ├── evidence.php                ← All stage evidence endpoints
│           ├── comments.php                ← Comments (order + project level)
│           ├── logistics.php               ← Shipment + customer import tracking
│           ├── service.php                 ← Service tickets + AMC contracts
│           ├── suppliers.php               ← Supplier management
│           └── ai.php                      ← AI report endpoints
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── types.ts                    ← ALL TypeScript types (Role union etc)
│   │   │   ├── auth.tsx                    ← useAuth() hook, JWT decode, AuthContext
│   │   │   └── api.ts                      ← Typed api.get/post/patch/delete helpers
│   │   ├── App.tsx                         ← Routes, RequireOwnerOrHr guard
│   │   ├── components/
│   │   │   ├── AppShell.tsx                ← Nav, role labels, top bar
│   │   │   ├── PipelineFlowchart.tsx       ← 12-stage visual pipeline (all roles)
│   │   │   ├── CustomerLoginPanel.tsx      ← Create/reset/move customer login
│   │   │   ├── StagePlannedDatesForm.tsx   ← SM/PC planned date editor
│   │   │   └── [many stage section components]
│   │   └── pages/
│   │       ├── UserManagementPage.tsx      ← Owner + HR Manager user admin
│   │       ├── ProjectsPage.tsx
│   │       ├── ProjectDetailPage.tsx
│   │       ├── OrderDetailPage.tsx
│   │       ├── OwnerDashboardPage.tsx      ← Also used by HR Manager
│   │       └── [role-specific dashboard pages]
│   └── dist/                               ← Build output, deploy this to server
├── docs/
│   └── ROADMAP.md                          ← Full change log, 1000+ lines
└── CLAUDE.md                               ← Standing instructions for Claude
```

---

## 5. Role Reference

| Role string | Display name | Visibility | Key permissions |
|---|---|---|---|
| `company_owner` | Company Owner | All projects/orders | Full — including delete |
| `hr_manager` | HR Manager | All projects/orders | Create users (any role), reset passwords, create projects/orders, comment. **No delete.** |
| `sales_manager` | Sales Manager | Own projects | Create orders/projects, set planned dates, manage customer logins |
| `project_coordinator` | Project Coordinator | Assigned projects | Stage status + notes, evidence entry, manage customer logins |
| `import_manager` | Import Manager | All projects/orders | Customs/import tracking stages |
| `installation_engineer` | Installation & Service Engineer | Assigned orders | Engineer reports, FAT/SAT, installation stages |
| `supplier` | Supplier | Orders for their company | Supplier-channel comments, limited stage visibility |
| `customer` | Customer | One scoped project | SAT acceptance, customer-channel comments |

**`VALID_ROLES` in `UserRepository.php` is the authoritative list** — adding a new role requires updating it there AND the DB ENUM AND `Scope.php`.

---

## 6. Known Users (Production)

| Name | Email | Role |
|---|---|---|
| Owen (Owner) | `owen@businesslinks-pk.com` | `company_owner` |
| Hamza | `hamza@businesslinks-pk.com` | `hr_manager` ← changed from sales_manager |
| Sana | `sana@businesslinks-pk.com` | `sales_manager` |
| Pia | `pia@businesslinks-pk.com` | `project_coordinator` |

---

## 7. The 12-Stage Pipeline

Controlled by `StageCompletionEvaluator.php`. Each stage has evidence requirements before it can be marked `completed`.

| # | Stage name | Key completion requirement |
|---|---|---|
| 1 | Requirements captured | Approved requirement + URS document OR owner exemption |
| 2 | Order placement | PO document + LC document |
| 3 | Machine manufacturing progress | Milestones recorded |
| 4 | Machine ready for FAT | FAT record exists |
| 5 | FAT completed | FAT pass result + IQ/OQ/DQ documents |
| 6 | Shipment dispatched | Dispatch date + shipping document |
| 7 | Customs clearance | Status='cleared' + customer_contact_email + customer_contact_phone |
| 8 | Machine received at site | Received date recorded |
| 9 | Installation in progress | Installation report submitted |
| 10 | Installation completed | Completion engineer report |
| 11 | Training | Training record + at least one attendee + customer acceptance |
| 12 | Handover | Handover engineer report + customer acceptance |

---

## 8. Critical Architecture Rules

1. **`Scope.php`** — every DB query that lists projects or orders calls `Scope::forProjects()` or `Scope::forOrders()`. Adding a role without updating Scope means that role sees nothing (`1=0` default).

2. **`OrderRepository::redactForRole()`** — strips `contract_value`, `currency`, `customer_name`, `sales_manager_name`, `project_coordinator_name` for `customer` and `supplier` roles before sending order JSON.

3. **Email domain enforcement** — internal roles (everything except `supplier`/`customer`) must have a `@businesslinks-pk.com` email. Enforced in both PHP (`validateEmailDomain()`) and the DB CHECK constraint.

4. **Passwords** — never logged, never stored in plaintext, never returned after initial creation. Temporary password is shown exactly once in the UI after create/reset.

5. **Stage status** — only `project_coordinator` can mark a stage `completed`. Sales Manager can set planned dates. Both enforced server-side.

---

## 9. Deployment Steps (Every Release)

### Frontend
```bash
cd frontend
npm run build          # produces dist/
# Zip dist/ → upload to m.businesslinks-pk.com/ via cPanel File Manager
# Extract zip, move files into place (index.html to root, assets/* to assets/)
```
**Chrome file-picker rule:** Tell Chrome to click Upload, then STOP. User picks the file from Downloads themselves.

### Backend PHP
Upload changed files individually via cPanel File Manager to `~/m.businesslinks-pk.com/api/src/` (matching the subfolder structure: Auth/, Models/, routes/).

### Database migrations
Run SQL in phpMyAdmin on database `usineul0_bli_orders`.

---

## 10. Task Status

### Completed (all shipped and live)
- Full 12-stage pipeline backend + frontend
- Role-based access control for all 8 roles
- Visual pipeline flowchart (all roles)
- Stage planned dates (SM + PC can edit)
- Customer login panel (Owner/SM/PC can create, reset, move)
- URS document + Owner exemption (Stage 1)
- LC document requirement (Stage 2)
- IQ/OQ/DQ documents (Stage 5)
- Shipping document (Stage 6)
- Customer coordinator contact (Stage 7)
- Training attendee structured records (Stage 11)
- Customer acceptance fix (was showing oldest instead of newest)
- Internal staffing row redacted from Customer/Supplier views
- Project column in Manage Users with reassignment dropdown
- Customer login move between projects (SM/Owner)
- **HR Manager role** for Hamza — full visibility, user management, no delete

### Pending / Open Questions
- **Task #27:** Confirm live that Sales Manager's customer-reassignment panel works (was blocked by Hamza's 401; now that Hamza is HR Manager, Sana (`sana@`) is the Sales Manager to test with)
- **Project auto-completion:** `projects.status` is never set to `completed` — no code does this. Decision needed: automatic (when all orders reach Handover) or manual Owner/PC button? **Not implemented yet.**
- ~~Backend PHP files for HR Manager~~ — **DONE 2026-09-23.** All 5 files uploaded and in place on the server (`~/m.businesslinks-pk.com/api/src/`): `Auth/Scope.php`, `Models/UserRepository.php`, `routes/users.php`, `routes/projects.php`, `routes/orders.php`.

---

## 11. How to Continue in a New Claude Session

Paste this into the new session:

> "This is a continuation of the BLI Order & Project Lifecycle Management System build. The GitHub repo is `alisiddiquibli-source/order-project-management-system`, branch `main`. The live site is at `m.businesslinks-pk.com`. Backend PHP is at `~/m.businesslinks-pk.com/api/src/` on Bluehost cPanel. Database is `usineul0_bli_orders`. The HANDOVER.md file in the repo root has the full project state. Read it and then read CLAUDE.md for standing instructions before making any changes."

Then point it to this file: `HANDOVER.md` and `CLAUDE.md` in the repo root.

---

## 12. E2E Test Suite (Local Only)

Tests live in `frontend/e2e/`. Run against a local test DB (`bli_e2e`) with seeded data.

Key spec files:
- `full-lifecycle.spec.ts` — complete 12-stage simulation
- `stage-dates-and-customer-login.spec.ts` — SM planned dates + customer login panel
- `external-role-redaction.spec.ts` — Customer/Supplier can't see internal staff names
- `user-role-scoping.spec.ts` — Supplier/Customer login creation requires correct reference

Playwright config: `frontend/playwright.config.ts`
Chromium path: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
