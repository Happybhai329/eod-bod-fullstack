/**
 * Bidirectional Synchronization Engine
 * 
 * Manages two-way data consistency between PostgreSQL (Supabase) / SQLite and Google Sheets:
 * - INBOUND: Pulls employees, departments, KRAs, SOPs, and configs from Sheets -> DB
 * - OUTBOUND: Pushes daily reports, head ratings, fines, and config changes from DB -> Sheets
 * - SCHEDULER: Automatic background sync loop (every 15 mins) with on-demand manual trigger
 */

import { query, run, get } from './db.js';
import {
  initGoogleSheets,
  readSheet,
  updateRange,
  appendRow,
  APP_DB_ID,
  fetchRealEmployees,
  fetchRealDepartments,
  fetchRealUserConfigs,
  fetchRealKRAs,
  fetchRealSOPs,
  syncDailyReportToSheets,
  syncFineToSheets,
  syncDepartmentToSheets,
  syncUserConfigToSheets
} from './googleSheets.js';

let isSyncing = false;
let lastSyncTime = null;
let lastSyncStatus = 'IDLE';
let lastSyncSummary = null;
let autoSyncInterval = null;

/**
 * 1. INBOUND SYNC: Google Sheets -> Database
 */
export async function syncInbound() {
  const summary = { employees: 0, departments: 0, kras: 0, sops: 0, configs: 0 };

  // A. Employees
  const employees = await fetchRealEmployees();
  for (const e of employees) {
    await run(
      `INSERT OR REPLACE INTO employees (id, emp_id, name, department, sub_department, other_department, designation, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.id, e.name, e.department, e.sub_department, e.other_department, e.designation || '', e.role, e.status]
    );
    summary.employees++;
  }

  // B. Departments
  const departments = await fetchRealDepartments();
  for (const d of departments) {
    await run(
      `INSERT OR REPLACE INTO departments (name, parent, head_id, head_name, is_main) VALUES (?, ?, ?, ?, ?)`,
      [d.name, d.parent, d.head_id, d.head_name, d.is_main]
    );
    summary.departments++;
  }

  // C. KRAs
  const kras = await fetchRealKRAs();
  for (const k of kras) {
    await run(
      `INSERT OR REPLACE INTO kras (id, timestamp, position_name, text, type) VALUES (?, ?, ?, ?, ?)`,
      [k.id, k.timestamp, k.position_name, k.text, k.type]
    );
    summary.kras++;
  }

  // D. SOPs
  const sops = await fetchRealSOPs();
  for (const s of sops) {
    await run(
      `INSERT OR REPLACE INTO sops (id, timestamp, position_name, kra_id, text, checklist, form_fields, doc_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.timestamp, s.position_name, s.kra_id, s.text, s.checklist, s.form_fields, s.doc_link]
    );
    summary.sops++;
  }

  // E. User Task Configurations
  const configs = await fetchRealUserConfigs();
  for (const c of configs) {
    await run(
      `INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`,
      [c.employee_id, c.config_json, c.last_updated]
    );
    summary.configs++;
  }

  return summary;
}

/**
 * 2. OUTBOUND SYNC: Database -> Google Sheets (High Efficiency Batch Mode)
 */
export async function syncOutbound() {
  const summary = { reportsSynced: 0, finesSynced: 0 };

  try {
    const existingData = await readSheet(APP_DB_ID, 'Daily_Reports');
    const existingMap = new Map();
    if (existingData && existingData.length > 1) {
      for (let i = 1; i < existingData.length; i++) {
        const row = existingData[i];
        if (row[0] && row[1]) {
          existingMap.set(`${row[0]}___${row[1]}`, i + 1);
        }
      }
    }

    const recentReports = await query(`SELECT * FROM daily_reports ORDER BY id DESC LIMIT 15`);
    for (const r of recentReports) {
      const key = `${r.date}___${r.employee_id}`;
      const targetRow = existingMap.get(key);

      const rowValues = [
        r.date, r.employee_id, r.department,
        r.bod_data || '', r.eod_data || '',
        r.system_score != null ? r.system_score : '',
        r.last_updated || '',
        r.head_rating != null ? r.head_rating : '',
        r.final_score != null ? r.final_score : '',
        r.attendance || 'Present', r.overtime || 0,
        r.rating_last_updated || '', r.rating_edited_by || '',
        r.approval_status || '', r.approval_timestamp || '',
        r.expiry_timestamp || '', r.rated_by || '',
        r.rated_on || '', r.fine_amount || '',
        r.fine_reason || '', r.fine_doc_url || '',
        r.fine_doc_name || '', r.fine_issued_on || '',
        r.fine_issued_by || '', r.fine_status || '',
        r.employee_remarks || ''
      ];

      if (targetRow) {
        await updateRange(APP_DB_ID, `Daily_Reports!A${targetRow}:Z${targetRow}`, [rowValues]);
      } else {
        await appendRow(APP_DB_ID, 'Daily_Reports', rowValues);
        existingMap.set(key, (existingData ? existingData.length : 1) + 1);
      }
      summary.reportsSynced++;
    }
  } catch (e) {
    console.warn('[Sync Outbound] Notice during daily reports sync:', e.message);
  }

  try {
    const finesData = await readSheet(APP_DB_ID, 'Fines').catch(() => []);
    const existingFineIds = new Set();
    if (finesData && finesData.length > 1) {
      for (let i = 1; i < finesData.length; i++) {
        if (finesData[i][0]) existingFineIds.add(finesData[i][0].toString().trim());
      }
    }

    const fines = await query(`SELECT * FROM fines ORDER BY id DESC LIMIT 15`);
    for (const f of fines) {
      if (!existingFineIds.has(f.id)) {
        await syncFineToSheets(f);
        existingFineIds.add(f.id);
        summary.finesSynced++;
      }
    }
  } catch (e) {
    console.warn('[Sync Outbound] Notice during fines sync:', e.message);
  }

  return summary;
}

/**
 * 3. ORCHESTRATE TWO-WAY SYNC
 */
export async function runTwoWaySync(triggeredBy = 'AUTO') {
  if (isSyncing) {
    return { success: false, message: 'Synchronization is currently in progress.' };
  }

  isSyncing = true;
  const startedAt = new Date().toISOString();
  const logId = 'SYNC_' + Date.now();

  try {
    const client = await initGoogleSheets();
    if (!client) {
      isSyncing = false;
      lastSyncStatus = 'NO_CREDENTIALS';
      return {
        success: false,
        message: 'Google Sheets sync disabled: GOOGLE_CREDENTIALS_JSON environment variable or credentials.json not configured.'
      };
    }

    console.log(`[Two-Way Sync] 🚀 Starting ${triggeredBy} two-way synchronization...`);

    // Inbound: Pull Google Sheets -> PostgreSQL
    const inboundSummary = await syncInbound();
    console.log(`[Two-Way Sync] 📥 Inbound complete:`, inboundSummary);

    // Outbound: Push PostgreSQL -> Google Sheets
    const outboundSummary = await syncOutbound();
    console.log(`[Two-Way Sync] 📤 Outbound complete:`, outboundSummary);

    const completedAt = new Date().toISOString();
    const finalSummary = { inbound: inboundSummary, outbound: outboundSummary, triggeredBy };

    await run(
      `INSERT OR REPLACE INTO sync_logs (id, started_at, completed_at, direction, status, summary, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, startedAt, completedAt, 'BIDIRECTIONAL', 'SUCCESS', JSON.stringify(finalSummary), null]
    );

    lastSyncTime = completedAt;
    lastSyncStatus = 'SUCCESS';
    lastSyncSummary = finalSummary;
    isSyncing = false;

    console.log(`[Two-Way Sync] ✅ Bidirectional sync finished successfully at ${completedAt}`);
    return { success: true, timestamp: completedAt, summary: finalSummary };

  } catch (err) {
    const completedAt = new Date().toISOString();
    console.error('[Two-Way Sync] ❌ Error during bidirectional sync:', err.message);

    try {
      await run(
        `INSERT OR REPLACE INTO sync_logs (id, started_at, completed_at, direction, status, summary, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [logId, startedAt, completedAt, 'BIDIRECTIONAL', 'FAILED', null, err.message]
      );
    } catch (dbErr) {
      console.error('[Two-Way Sync] Failed to record sync log:', dbErr.message);
    }

    lastSyncTime = completedAt;
    lastSyncStatus = 'FAILED';
    lastSyncSummary = { error: err.message, triggeredBy };
    isSyncing = false;

    return { success: false, error: err.message, timestamp: completedAt };
  }
}

/**
 * 4. GET CURRENT SYNC STATUS
 */
export async function getSyncStatus() {
  let lastDbLog = null;
  try {
    lastDbLog = await get(`SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1`);
  } catch (e) {}

  return {
    isSyncing,
    lastSyncTime: lastSyncTime || lastDbLog?.completed_at || null,
    lastSyncStatus: lastSyncStatus !== 'IDLE' ? lastSyncStatus : (lastDbLog?.status || 'IDLE'),
    lastSyncSummary: lastSyncSummary || (lastDbLog?.summary ? JSON.parse(lastDbLog.summary) : null),
    isConfigured: Boolean(process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  };
}

/**
 * 5. BACKGROUND AUTO-SCHEDULER (Every 15 minutes)
 */
export function startAutoSync(intervalMs = 15 * 60 * 1000) {
  if (autoSyncInterval) clearInterval(autoSyncInterval);

  console.log(`[Two-Way Sync] ⏰ Background auto-sync scheduled every ${Math.round(intervalMs / 60000)} minutes.`);
  autoSyncInterval = setInterval(() => {
    runTwoWaySync('AUTO').catch(err => {
      console.warn('[Two-Way Sync] Background run notice:', err.message);
    });
  }, intervalMs);

  // Optional: run a background sync 10 seconds after server launch
  setTimeout(() => {
    runTwoWaySync('BOOT').catch(err => {
      console.log('[Two-Way Sync] Initial boot sync notice:', err.message);
    });
  }, 10000);
}
