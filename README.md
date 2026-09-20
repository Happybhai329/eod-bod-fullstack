# 🏢 Daily Operations Hub (EOD & BOD Full-Stack Web Application)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://eod-bod-operations-hub.onrender.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express.js](https://img.shields.io/badge/Express.js-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-8.23%20(pg)-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![SQLite3](https://img.shields.io/badge/SQLite-5.1-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Google Sheets API](https://img.shields.io/badge/Google%20Sheets%20API-v4-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)](https://developers.google.com/sheets/api)
[![Tests](https://img.shields.io/badge/Tests-17%20Passed-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/api/test.html)

---

## 📖 Overview

**Daily Operations Hub** is an enterprise-grade full-stack workforce performance management application designed to streamline daily employee operations through structured **Beginning of Day (BOD)** planning and **End of Day (EOD)** achievement reporting.

The system features an automated **two-tier scoring algorithm**, manager performance multipliers ($0\% - 200\%$), a **24-hour auto-approval SLA window**, disciplinary fine issuance with printable HTML/PDF notice generation, searchable KRA & SOP knowledge repositories, and **bidirectional real-time synchronization with Google Sheets**. Built with a dual-engine database architecture, it seamlessly operates on cloud-hosted **PostgreSQL (Supabase)** in production or local **SQLite3** for development and offline resilience.

---

## 🚀 Key Features

### 🌅 Morning Priority Planning (BOD)
- Define daily tasks, priorities, estimated durations, and measurable output targets before workday commencement.
- Configurable task templates adapt to each employee's specific role and workflow requirements.
- Configurable edit grace window (10 hours) prevents unauthorized retrofitting while allowing morning adjustments.

### 🌇 Evening Achievement Tracking (EOD) & Live Scoring
- Log quantitative achievements, completion statuses, and explanatory notes against morning BOD commitments.
- **Real-time Live Score Preview**: Interactive progress bar dynamically computes the daily system score as numbers are typed.
- Enforced submission deadline and edit window (4 hours) ensure data integrity and audit readiness.

### 🧮 Objective Dual-Tier Scoring Engine
- **Algorithmic System Score ($0-100\%$)**: Unbiased mathematical assessment comparing achieved metrics against planned targets across 4 distinct task input types (`number`, `checkbox`, `categoryNumber`, and `dynamicList`).
- **Manager Multiplier Rating ($0-200\%$)**: Department heads evaluate execution quality, problem-solving, and diligence using multiplier ratings ($100\%$ = neutral, $>100\%$ = bonus, $<100\%$ = penalty).
- **Composite Final Score ($0-200\%$)**: Transparent formula: $\text{Final Score} = \text{round}\left(\frac{\text{System Score} \times \text{Head Rating}}{100}\right)$.

### ⏰ 24-Hour Auto-Approval SLA Mechanism
- Automated evaluation daemon checks pending reports on manager dashboard requests.
- Submissions awaiting review for more than 24 hours automatically transition to `Auto Approved` status with a default $100\%$ neutral multiplier, preventing employee progress blockage.

### 👥 Department & Team Management Dashboard
- Multi-tier organizational hierarchy support (Divisions $\rightarrow$ Departments $\rightarrow$ Sub-departments).
- Inline team rating tools allowing heads to approve, adjust multipliers, or leave remarks in real time.
- Role-based views: Department heads can instantly toggle between **"Team Review"** and **"My Workday"** views.
- Custom employee task configuration builder supporting customized KPIs per user.

### ⚖️ Disciplinary Fine Notice System
- Issue formal disciplinary notices directly from the manager portal with specific infraction dates and penalty amounts.
- Generate clean, printable formal HTML documentation with official seals and acknowledgment signature blocks.
- End-to-end lifecycle tracking: `Pending` $\rightarrow$ `Acknowledged` or `Disputed` $\rightarrow$ `Paid`.

### 📚 Integrated KRA & SOP Knowledge Base
- Case-insensitive multi-field search across Key Result Areas (KRAs) and Standard Operating Procedures (SOPs).
- Direct access to role checklists, operational templates, and reference documentation.

### 🔄 Bidirectional Google Sheets Outbox & Sync Worker
- Synchronizes with three external Google Spreadsheets:
  1. `MASTER_DB`: Employees, departments, and organization hierarchy.
  2. `APP_DB`: Daily reports, task configurations, fine records, and audit notifications.
  3. `KRA_SOP_DB`: Operational standards and procedure references.
- Background worker triggers automated syncs every 15 minutes, upon server boot, or on-demand via the Head Dashboard.
- Concurrency locking prevents race conditions, and an audit trail is logged to the `sync_logs` table.

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Client Layer
        Browser["React 18 SPA<br/>Vite Build + Bootstrap Icons"]
    end

    subgraph Application Layer
        Express["Express.js REST API<br/>Node.js (Port 3000 / 10000)"]
        Scoring["Scoring Engine<br/>server/scoringEngine.js"]
        Sync["Two-Way Sync Engine<br/>server/syncEngine.js"]
        AutoApprove["Auto-Approval Engine<br/>server/autoApproval.js"]
    end

    subgraph Data Layer
        DBDriver["Dual Database Driver<br/>server/db.js"]
        PG["PostgreSQL (Supabase Cloud)<br/>pg Pool with SSL"]
        SQLite["SQLite3 (Local Fallback)<br/>server/database.sqlite"]
    end

    subgraph External Integrations
        GSheets["Google Sheets API v4<br/>Service Account Auth"]
        MasterSheet["MASTER_DB Spreadsheet<br/>(Employees & Depts)"]
        AppSheet["APP_DB Spreadsheet<br/>(Reports & Fines)"]
        KraSheet["KRA_SOP_DB Spreadsheet<br/>(KRAs & SOPs)"]
    end

    Browser -->|"/api/* REST Requests"| Express
    Express --> Scoring
    Express --> Sync
    Express --> AutoApprove
    Express --> DBDriver
    DBDriver -->|DATABASE_URL present| PG
    DBDriver -->|Fallback / Local dev| SQLite
    Sync -->|Inbound & Outbound| GSheets
    GSheets --> MasterSheet
    GSheets --> AppSheet
    GSheets --> KraSheet
```

---

## 🛠️ Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Frontend Framework** | React | `^18.3.1` | Component-driven Single Page Application (SPA) |
| **Build Tool & Dev Server** | Vite | `^5.4.14` | High-performance bundling and HMR dev proxy |
| **Icons & Styling** | Lucide React & Bootstrap Icons | `^0.475.0` / `1.11.3` | UI iconography and responsive CSS design system tokens |
| **Typography** | Inter (Google Fonts) | `300–800` | Clean, modern enterprise typography |
| **Backend Framework** | Express.js | `^4.21.2` | REST API routing, request parsing, and business logic |
| **Runtime** | Node.js (ES Modules) | `>=18.0.0` | Server execution runtime (`"type": "module"`) |
| **Cloud Database** | PostgreSQL via `pg` | `^8.23.0` | Production relational database (Supabase SSL connection) |
| **Local Database** | SQLite3 | `^5.1.7` | Local fallback database with zero setup requirements |
| **Cloud Integration** | Google APIs (`googleapis`) | `^174.0.1` | Google Sheets API v4 bidirectional synchronization |
| **Testing Suite** | Node.js Native Test Runner | Built-in | Fast zero-dependency unit and integration testing (`node:test`) |
| **Deployment** | Render | Free Tier | Blueprint configuration (`render.yaml`) |

---

## 📋 Prerequisites

Before running the application locally, ensure you have:

- **Node.js**: `v18.0.0` or higher (`v20.x` or `v24.x` recommended)
- **npm**: `v9.0.0` or higher
- **Git** installed on your system
- *(Optional)* A **Google Cloud Platform** service account JSON key with Google Sheets API enabled.
- *(Optional)* A **PostgreSQL** database URI (e.g., from Supabase). If not provided, the server automatically defaults to local SQLite3.

---

## ⚙️ Installation & Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Happybhai329/eod-bod-fullstack.git
cd eod-bod-fullstack
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory (refer to the [Environment Variables](#-environment-variables) section below):

```env
PORT=3000
NODE_ENV=development
# DATABASE_URL=postgresql://postgres:password@host:6543/postgres?sslmode=require
```

### 4. (Optional) Configure Google Sheets Credentials

If enabling real-time Google Sheets backup:
1. Create a Service Account in [Google Cloud Console](https://console.cloud.google.com/) and download the JSON key.
2. Share target spreadsheets with your Service Account email (give `Editor` permission).
3. Place the file at `server/credentials.json` (see `server/credentials.example.json` for schema) **OR** set the `GOOGLE_CREDENTIALS_JSON` environment variable.

### 5. Run the Application

#### Development Mode (Frontend + Backend)
Run the Vite development server with hot reload:
```bash
npm run dev
```
In a second terminal, start the Express API backend:
```bash
npm run server
```
*The Vite dev server proxies `/api/*` requests to `http://localhost:3000` automatically.*

#### Production Mode
Build the frontend bundle and run the combined Express server:
```bash
npm run build
npm start
```

Visit **`http://localhost:3000`** in your browser.

---

## 🔧 Environment Variables

Configure the following variables in your `.env` file or cloud deployment dashboard:

| Variable | Required | Default | Description |
|----------|:--------:|:-------:|-------------|
| `PORT` | No | `3000` (Local) / `10000` (Render) | Port on which the Express server listens. |
| `NODE_ENV` | No | `development` | Runtime environment (`development` or `production`). |
| `DATABASE_URL` | No | *None* | PostgreSQL connection string. When omitted, uses local `server/database.sqlite`. |
| `GOOGLE_CREDENTIALS_JSON` | No | *None* | Raw JSON string or base64-encoded GCP Service Account credentials for Sheets sync. |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | No | *None* | Alternative variable holding the GCP service account private key. |

---

## 📂 Project Structure

```
eod-bod-fullstack/
├── index.html                   # HTML5 SPA entry point (Inter font & Bootstrap icons)
├── package.json                 # Project dependencies, build scripts, and engine specs
├── render.yaml                  # Render 1-click infrastructure blueprint specification
├── vite.config.js               # Vite bundler configuration & local /api dev proxy
├── technical_design_document.md # Full technical specification and schema documentation
│
├── server/                      # Express Backend & Business Logic
│   ├── index.js                 # Primary Express REST API server and routes
│   ├── db.js                    # Dual-engine DB layer (PostgreSQL + SQLite) & migrations
│   ├── scoringEngine.js         # Algorithmic performance scoring & validation logic
│   ├── syncEngine.js            # Bidirectional Google Sheets sync worker
│   ├── autoApproval.js          # 24-hour review SLA auto-approval checker
│   ├── googleSheets.js          # Google Sheets API v4 client wrapper
│   ├── jsdb.js                  # In-memory JSON/caching database helpers
│   ├── credentials.example.json # Template for GCP service account authentication
│   └── database.sqlite          # Local SQLite3 database (generated on first run)
│
├── src/                         # React Frontend Application
│   ├── main.jsx                 # React 18 DOM root initialization
│   ├── App.jsx                  # Main application controller, modal state, and router
│   ├── components/              # Modular UI components
│   │   ├── Login.jsx            # Multi-field authentication UI (Emp ID / Role check)
│   │   ├── Navbar.jsx           # Global navigation, view switcher, and notification bell
│   │   ├── EmployeeDashboard.jsx# Employee workday portal, daily metrics, and submission status
│   │   ├── HeadDashboard.jsx    # Manager command center, team review grid, and sync actions
│   │   ├── BodEodFormModal.jsx  # Dynamic BOD/EOD modal with live scoring engine preview
│   │   ├── TaskConfigModal.jsx  # Employee task builder (number, checkbox, category, dynamic)
│   │   ├── FineModal.jsx        # Disciplinary fine creator and document viewer
│   │   ├── NotificationsModal.jsx# Drawer displaying system alerts and status updates
│   │   ├── KraSopModal.jsx      # Searchable knowledge base for KRAs and SOPs
│   │   ├── DepartmentStructureModal.jsx # Organizational chart and head assignment
│   │   ├── ReportDetailModal.jsx# Granular breakdown viewer for past daily submissions
│   │   ├── AssignedTasksPanel.jsx# Quick-reference overview of assigned daily items
│   │   └── ErrorBoundary.jsx    # React error boundary component for graceful failure
│   └── styles/
│       └── main.css             # Design tokens, variables, cards, badges, and responsive CSS
│
└── test/                        # Automated Test Suites
    ├── api.test.js              # Integration tests for auth, reports, fines, and health check
    ├── scoringEngine.test.js    # Unit tests for scoring logic, edge cases, and clamps
    └── sync.test.js             # Integration tests for Google Sheets synchronization engine
```

---

## 🧮 Scoring Engine Logic

The scoring engine evaluates employee performance by comparing committed morning plans with evening executions:

### Supported Task Types

| Task Type | BOD Commitment | EOD Achievement | System Score Formula |
|-----------|----------------|-----------------|----------------------|
| `number` | Numerical target | Actual achieved | $\frac{\text{Achieved}}{\text{Target}} \times 100$ |
| `checkbox` | Listed priority task | `Done` or `Pending` | $100\%$ if Done, $0\%$ if Pending |
| `categoryNumber` | Sub-category targets | Sub-category actuals | $\frac{\sum \text{Achieved}_i}{\sum \text{Target}_i} \times 100$ |
| `dynamicList` | Dynamically added items | Per-item achievement | $\frac{\sum \text{Achieved}_i}{\sum \text{Target}_i} \times 100$ *(Voluntary bonus items add to achieved only)* |

### Composite Formulas

$$\text{System Score} = \text{round}\left(\frac{1}{N} \sum_{i=1}^{N} \text{clamp}(\text{TaskScore}_i, 0, 100)\right)$$

$$\text{Final Score} = \text{round}\left(\text{clamp}\left(\frac{\text{System Score} \times \text{Head Rating}}{100}, 0, 200\right)\right)$$

#### Head Rating Multiplier Matrix

| Head Rating | Impact Multiplier | Example ($\text{System} = 80\%$) | Outcome |
|:-----------:|:-----------------:|:--------------------------------:|:--------|
| **$200\%$** | $2.0\times$ | $80\% \times 2.0 = 160\%$ | Exceptional Performance (Max Bonus) |
| **$150\%$** | $1.5\times$ | $80\% \times 1.5 = 120\%$ | Exceeds Standard Expectations |
| **$125\%$** | $1.25\times$ | $80\% \times 1.25 = 100\%$ | High Quality Execution |
| **$100\%$** | $1.0\times$ | $80\% \times 1.0 = 80\%$ | Neutral Rating (Standard Multiplier) |
| **$50\%$** | $0.5\times$ | $80\% \times 0.5 = 40\%$ | Partial Execution / Quality Deficiency |
| **$0\%$** | $0.0\times$ | $80\% \times 0.0 = 0\%$ | Serious Incompletion / Default Zero |

---

## 📡 API Reference Summary

### Health & Diagnostics
- `GET /api/health` — Returns system uptime, timestamp, database type, and active employee count.

### Authentication
- `POST /api/auth/login` — Validates employee ID or code and resolves Head/Admin privileges.

### Employee Lifecycle
- `GET /api/employee/:id/form` — Retrieves today's report status, task definitions, and edit windows.
- `POST /api/employee/:id/report` — Submits or updates BOD plan or EOD execution report.
- `GET /api/employee/:id/dashboard` — Fetches performance metrics, submission logs, and assigned fines.

### Head & Manager Operations
- `GET /api/head/dashboard` — Retrieves team submission matrices, pending reviews, and department members.
- `POST /api/head/rate` — Submits manager review rating ($0-200\%$) and approval remarks.

### Fine Management
- `GET /api/fines` — Lists recorded fines with filters for employee or issuing head.
- `POST /api/fines/issue` — Issues a formal disciplinary notice.
- `POST /api/fines/status` — Updates status (`Acknowledged`, `Disputed`, `Paid`).
- `GET /api/fines/:id/document` — Generates a formal printable HTML fine notice.

### Knowledge Base & Sync
- `GET /api/kras` — Fast search for Key Result Areas across position, type, and text.
- `GET /api/sops/:kraId` — Retrieves detailed SOP checklist and templates for a given KRA.
- `GET /api/sync/status` — Retrieves synchronization status, last run timestamp, and logs.
- `POST /api/sync/trigger` — Initiates an immediate two-way Google Sheets synchronization.

---

## 🧪 Testing

The test suite utilizes the native Node.js test runner (`node:test`) and assertion library (`node:assert/strict`), requiring zero third-party dependencies.

```bash
# Run the complete test suite (17 tests)
npm test

# Run individual test suites
node --test test/scoringEngine.test.js   # 9 unit tests for the scoring algorithms
node --test test/api.test.js             # 6 integration tests for API workflows
node --test test/sync.test.js            # 2 tests for the Google Sheets sync engine
```

### Test Coverage Highlights
- **Boundary Conditions**: Zero inputs, $100\%$, $200\%$ limits, negative values, and overflow scenarios.
- **Type Coercion Defense**: Robust handling of `null`, `undefined`, string numbers (`"85%"`), and `NaN`.
- **State Machine Integrity**: Validation of fine transitions and 24-hour auto-approval expirations.
- **Graceful Degradation**: Verifies backend functionality even if Google Cloud credentials are unavailable.

---

## ☁️ Deployment on Render

This repository includes a [`render.yaml`](render.yaml) blueprint specification for seamless deployment on Render:

1. Push your repository to **GitHub**.
2. Log in to [Render Dashboard](https://dashboard.render.com/) and navigate to **New +** $\rightarrow$ **Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml` with the following configuration:
   - **Environment**: Node
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
4. Set your production environment variables (`DATABASE_URL` and `GOOGLE_CREDENTIALS_JSON`) in the Render dashboard under **Environment**.
5. Click **Apply** to deploy!

---

## 🔒 Security & Best Practices

- **Zero Credential Leaks**: Service account JSON files, SQLite databases, and `.env` files are strictly excluded via `.gitignore`.
- **SQL Injection Prevention**: All queries utilize native parameterized bindings (`$1, $2, ...` in Postgres, `?, ?` in SQLite).
- **Report Immutability**: Once an EOD report reaches `Approved` or `Auto Approved` status, further modifications are rejected.
- **Strict SLA Edit Windows**: BOD (10 hours) and EOD (4 hours) grace periods prevent unapproved post-shift modifications.
- **Role Isolation**: Sub-department reassignment and structural adjustments are strictly restricted to verified administrators.

---

## 🤝 Contributing

Contributions are welcome! Follow these steps to contribute:

1. **Fork** the repository.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit Your Changes**:
   ```bash
   git commit -m "feat: add amazing new feature"
   ```
4. **Run Tests**:
   ```bash
   npm test
   ```
5. **Push to Branch**:
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request**.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE) or applicable organization proprietary licensing terms.

---

## 👤 Author

**Happybhai329**
- GitHub: [@Happybhai329](https://github.com/Happybhai329)
- Repository: [Happybhai329/eod-bod-fullstack](https://github.com/Happybhai329/eod-bod-fullstack)
