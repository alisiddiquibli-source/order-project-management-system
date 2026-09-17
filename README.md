# Order & Project Lifecycle Management System

A system to plan, execute and monitor equipment/project orders end-to-end:
requirements → ordering → machine manufacturing progress at the supplier's
site → machine testing material coordination → machine FAT readiness →
shipment coordination → import clearance in Pakistan → delivery →
installation → SAT → training → handover → post-handover service/AMC.

Built for the internal team (Company Owner, Project Coordinator, Sales
Manager, Import Manager, Installation & Service Engineer), with one
observer-plus-comment login per project for the **supplier** and the
**customer** on that project — no data entry, view + comment only.

## Structure

```
order-project-management-system/
├── docs/
│   ├── ARCHITECTURE.md   System design: entities, workflow stages, roles, AI layer
│   └── ROADMAP.md        Phased build plan
├── backend/              PHP 8 + PDO/MySQL REST API (to be scaffolded)
└── frontend/             Web app (to be scaffolded)
```

## Hosting

Bluehost shared/business hosting (cPanel), PHP + MySQL — consistent with the
team's existing housekeeping-system deployment.

## Where to start

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design, and
[docs/ROADMAP.md](docs/ROADMAP.md) for build order and current phase.
