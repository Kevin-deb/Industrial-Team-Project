# CareLink Doctor Service System

A doctor-facing subsystem for the Smart Medical and Elderly Care Big Data Public Service Platform. Iteration 0 provides a working Windows-compatible application shell, a light medical UI, versioned API contracts, a local relational database, and isolated domain modules for a five-person team.

**Current release: framework demonstration, using fictional records only.** Patient search, filters, read-only details, charts, navigation, audit browsing and the local community visibility preference work. Identity verification, clinical writes, prescriptions, live consultation, recording, notifications, uploads and exports are planned features. The UI labels them “待上线”; corresponding API actions return an explicit `501 FEATURE_NOT_IMPLEMENTED`. Do not enter real patient data in this scaffold.

![CareLink doctor workspace](docs/images/dashboard.png)

## Quick start on Windows

Install **Node.js 24 LTS, version 24.14.0 or later in the 24.x line**, including npm. Node is the only application prerequisite. No Docker, database service, Visual Studio compiler or separate Python installation is needed.

Open PowerShell or Windows Terminal in the repository directory:

```powershell
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API runs at `127.0.0.1:3001`; Vite proxies `/api` to it. Both services use loopback only. Stop them with `Ctrl+C`. The directory name may contain spaces and its parent may contain Chinese characters.

For a single-server demonstration, double-click `start-windows.cmd`, or run:

```powershell
npm ci
npm run build
npm start
```

Open [http://127.0.0.1:3001](http://127.0.0.1:3001). The built API serves the web application and supports direct navigation to page URLs. Keep the terminal open while using the application.

Initial dependency installation requires the internet. After installation and build, the local demo works without external network services. There are no runtime CDN fonts or image dependencies. First launch creates `runtime/data/doctor.sqlite` using numbered domain migrations and fictional seed records. A normal restart preserves the database. Generated databases are excluded from Git.

The built application is still a **local demo**. Setting `NODE_ENV=production` is intentionally rejected until real authentication and operational controls are delivered. On Node versions where `node:sqlite` is marked experimental, its runtime warning is expected; the repository adapter confines that dependency to the backend.

## Documentation for the team

| Document                                                       | Purpose                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Iteration plan](docs/ITERATION_PLAN.md)                       | English delivery plan, five-person ownership, basic features first, iteration gates |
| [Architecture](docs/ARCHITECTURE.md)                           | Domain boundaries, deployment, entities, integration ports and extension strategy   |
| [API conventions](docs/API_CONVENTIONS.md)                     | Versioned contracts, request and response rules, compatibility and planned behavior |
| [Requirements traceability](docs/REQUIREMENTS_TRACEABILITY.md) | Source requirements mapped to modules, iterations and acceptance criteria           |
| [Team workflow](docs/TEAM_WORKFLOW.md)                         | Parallel development, branch conventions, review and shared-file coordination       |

The requirements and previous presentation files remain in the parent workspace's `docs` and `output` directories. Source references and decisions are recorded in the repository documentation; software and developer documentation live in this repository.

## Repository layout

```text
apps/web/              React and TypeScript doctor UI
  src/dashboard/       Aggregated read-only work overview
  src/modules/         Independently owned business pages
  src/shared/          API client and common UI primitives
apps/api/              Fastify modular backend
  src/platform/        Shared identity, policy and audit foundation
  src/patients/        Patient domain
  src/encounters/      Online encounters and remote consultations
  src/clinical/        Medical records, review and orders
  src/health/          Observations, plans and reminders
  src/social/          Isolated optional community scaffold
  src/database/        Migration composition and local database adapter
packages/contracts/    Shared API DTOs and provider port interfaces
docs/                  English plan, architecture and contract guidance
scripts/               Repository checks and Windows support
tests/                 Browser integration checks
runtime/               Generated local data, ignored by Git
```

## Checks

```powershell
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run format:check` checks source formatting; `npm run format` applies the shared style.

`check` validates module boundaries, strict TypeScript, backend integration tests and both application builds. Browser tests exercise actual UI/API integration, planned-feature messaging, keyboard interactions and responsive layout. The [CI template](docs/ci/README.md) targets Windows and Ubuntu. It is not active yet because the available GitHub credential lacks workflow-upload permission. Browser-test artifacts stay in ignored directories.

## Implementation scope

The backend starts as a modular monolith: one process with isolated domain code and stable contracts. Each domain owns its tables and repository. Other modules consume public interfaces and IDs instead of directly modifying those tables. SQLite keeps development setup small; production PostgreSQL requires a new repository adapter and database migrations, not a new UI or clinical workflow design.

Roles, patient scope, time-limited grants, record versions, review states, media references, reminders, outbox events and social isolation are represented in the framework. Only the explicitly documented demo read paths execute today. An interface, table or placeholder does not imply the corresponding production capability is finished.

See the English plan for the implementation order and acceptance tests before enabling each feature. Providers for identity, hospital/device data, RTC, recording, storage and notifications are replaceable ports; no real provider credentials are bundled.

## Technology references

Runtime and tool requirements were checked against the [Node.js 24 SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Vite guide](https://vite.dev/guide/) and [Fastify v5 migration guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/). Dependency versions are fixed by `package-lock.json`; use `npm ci` for consistent team installs.
