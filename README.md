# 🚀 Daily Operations Hub (BOD & EOD Full-Stack Web Application)

An enterprise full-stack web application for managing daily workforce operations, morning priority planning (**BOD**), evening achievement recording (**EOD**), objective system scoring, head rating reviews, fine notices, and searchable KRAs & SOPs.

---

## 🌟 Key Features

- **Morning BOD Planning**: Define daily priorities, measurable targets, and key action items.
- **Evening EOD Tracking**: Record actual progress, calculate system completion %, and submit reports.
- **Objective Scoring Engine**:
  - `System Score % = clamp( sum(completed_percentages) / task_count, 0, 100 )`
  - `Final Score % = round( clamp( (SystemScore * HeadRating) / 100, 0, 200 ) )`
- **Head & Manager Operations**:
  - Multi-department team performance dashboard.
  - Inline head review ratings (0–200%) & 24-hr review auto-approval window.
  - Sub-department head assignment & hierarchy administration.
  - Employee custom task configuration builder.
  - Fine notice issuance & PDF generation.
- **KRA & SOP Hub**: Fast searchable repository for Key Result Areas & Standard Operating Procedures.
- **Outbox Google Sheets Backup**: Asynchronous synchronization worker backing up all operations to Google Sheets.

---

## 🏗️ Architecture

```
React 18 + Vite SPA  <---> Express.js REST API  <---> SQLite / PostgreSQL
                                                       |
                                                       v (Outbox Sync)
                                                 Google Sheets API
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Clone Repository & Install Dependencies
```bash
git clone https://github.com/YOUR_USERNAME/eod-bod-fullstack.git
cd eod-bod-fullstack
npm install
```

### 3. Configure Google Credentials (Optional for Live Sheets Backup)
1. Obtain a Service Account key from Google Cloud Console.
2. Share your Google Sheets with the Service Account email (`Editor` access).
3. Place the JSON key at `server/credentials.json` (see `server/credentials.example.json` for structure).

### 4. Build & Run Application
```bash
# Build frontend static assets
npm run build

# Start production server
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## ☁️ Deployment on Render (1-Click Blueprint)

This repository includes a [`render.yaml`](file:///d:/prime/eod%20bod%20full%20stack/render.yaml) specification for zero-config deployment on Render.com.

### Steps to Deploy:
1. Push your repository to **GitHub** or **GitLab**.
2. Go to the [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml` and configure:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check**: `/api/health`
4. *(Optional)* If syncing to Google Sheets, add your Service Account JSON into the environment variable **`GOOGLE_CREDENTIALS_JSON`**.
5. Click **Apply** to deploy!

---

## 💻 Development & Testing Commands

| Command | Description |
|:---|:---|
| `npm run dev` | Run Vite frontend dev server with hot reload |
| `npm run build` | Compile production bundle to `dist/` |
| `npm test` | Run full automated test suite with Node test runner |
| `npm start` | Start Node.js Express server |

---

## 🔒 Security Note
Private API keys, database files, and Google Service Account credentials are excluded via `.gitignore`. Always use environment variables or local key files when deploying.

