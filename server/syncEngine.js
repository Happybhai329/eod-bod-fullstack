/**
 * Bidirectional Synchronization Engine
 * 
 * Manages two-way data consistency between PostgreSQL (Supabase) / SQLite and Google Sheets:
 * - INBOUND: Pulls employees, departments, KRAs, SOPs, configs, reports, fines from Sheets -> DB
 * - OUTBOUND: Pushes daily reports, fines, configs, department changes from DB -> Sheets
 * - Uses last_updated timestamp comparison to prevent overwriting newer data
 * - SCHEDULER: Automatic background sync loop (every 15 mins) with on-demand manual trigger
 */

import { query, run, get, getIsPostgres } from './db.js';
import {
  initGoogleSheets,
  readSheet,
  updateRange,
  batchUpdateRanges,
  appendRow,
  appendRows,
  normalizeDateToDDMMYYYY,
  formatIndianDateTime,
  parseTimestampSafe,
  MASTER_DB_ID,
  APP_DB_ID,
  fetchRealEmployees,
  fetchRealDepartments,
  fetchRealUserConfigs,
  fetchRealKRAs,
  fetchRealSOPs,
  fetchRealDailyReports,
  fetchRealFines,
  sanitizeScore,
  syncDailyReportToSheets,
  syncFineToSheets,
  syncDepartmentToSheets,
  syncUserConfigToSheets
} from './googleSheets.js';
import { checkAutoApprovals } from './autoApproval.js';

let isSyncing = false;
let lastSyncTime = null;
let lastSyncStatus = 'IDLE';
let lastSyncSummary = null;
let autoSyncInterval = null;

/**
 * Parse a timestamp to milliseconds for comparison.
 * Uses parseTimestampSafe to handle DD/MM/YYYY, ISO, and flipped dates.
 * Returns 0 if the value is not a valid date.
 */
function toTimestampMs(val) {
  return parseTimestampSafe(val) || 0;
}

/**
 * Safe stringify for bod_data / eod_data — handles objects and strings.
 */
function safeJsonString(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/**
 * 1. INBOUND SYNC: Google Sheets -> Database
 * 
 * Rules:
 * - Employees & KRAs/SOPs: Always overwrite DB (Sheets is master for these)
 * - Daily Reports: Only overwrite DB if Sheet row has newer last_updated
 * - Fines: Upsert by fine_id
 * - User Configs: Only overwrite DB if Sheet row has newer last_updated
 * - Departments: Always overwrite DB (Sheets is master)
 */
export async function syncInbound() {
  const summary = { employees: 0, departments: 0, kras: 0, sops: 0, configs: 0, reports: 0, fines: 0, errors: 0, skippedNewerInDb: 0 };
  const isPg = getIsPostgres();

  // ============ A. Employees (Inbound Only — Sheets is master) ============
  try {
    const employees = await fetchRealEmployees();
    for (let i = 0; i < employees.length; i += 6) {
      const chunk = employees.slice(i, i + 6);
      await Promise.all(chunk.map(async (e) => {
        try {
          if (isPg) {
            await run(
              `INSERT INTO employees ("employeeId", emp_id, name, department, sub_department, other_department, designation, role, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT ("employeeId") DO UPDATE SET
                 emp_id = EXCLUDED.emp_id,
                 name = EXCLUDED.name,
                 department = EXCLUDED.department,
                 sub_department = EXCLUDED.sub_department,
                 other_department = EXCLUDED.other_department,
                 designation = EXCLUDED.designation,
                 role = EXCLUDED.role,
                 status = EXCLUDED.status`,
              [e.id, e.id, e.name, e.department, e.sub_department, e.other_department, e.designation || '', e.role, e.status]
            );
          } else {
            await run(
              `INSERT OR REPLACE INTO employees (id, emp_id, name, department, sub_department, other_department, designation, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [e.id, e.id, e.name, e.department, e.sub_department, e.other_department, e.designation || '', e.role, e.status]
            );
          }
          summary.employees++;
        } catch (err) {
          summary.errors++;
          console.error(`[Sync Inbound] Employee ${e.id} error:`, err.message);
        }
      }));
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] Employees fetch error:', err.message);
  }

  // ============ B. Departments (Inbound — Sheets is master) ============
  try {
    const departments = await fetchRealDepartments();
    for (const d of departments) {
      try {
        if (isPg) {
          await run(
            `INSERT INTO departments (name, "departmentName", "departmentId", parent, head_id, head_name, is_main)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (name) DO UPDATE SET
               "departmentName" = EXCLUDED."departmentName",
               parent = EXCLUDED.parent,
               head_id = EXCLUDED.head_id,
               head_name = EXCLUDED.head_name,
               is_main = EXCLUDED.is_main`,
            [d.name, d.name, 'DEPT_' + d.name.replace(/[^A-Z0-9]/gi, '_').toUpperCase(), d.parent, d.head_id, d.head_name, d.is_main]
          );
        } else {
          await run(
            `INSERT OR REPLACE INTO departments (name, parent, head_id, head_name, is_main) VALUES (?, ?, ?, ?, ?)`,
            [d.name, d.parent, d.head_id, d.head_name, d.is_main]
          );
        }
        summary.departments++;
      } catch (err) {
        summary.errors++;
        console.error(`[Sync Inbound] Department ${d.name} error:`, err.message);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] Departments fetch error:', err.message);
  }

  // ============ C. KRAs (Inbound Only) ============
  try {
    const kras = await fetchRealKRAs();
    for (const k of kras) {
      try {
        await run(
          `INSERT OR REPLACE INTO kras (id, timestamp, position_name, text, type) VALUES (?, ?, ?, ?, ?)`,
          [k.id, k.timestamp, k.position_name, k.text, k.type]
        );
        summary.kras++;
      } catch (err) {
        summary.errors++;
        console.error(`[Sync Inbound] KRA ${k.id} error:`, err.message);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] KRAs fetch error:', err.message);
  }

  // ============ D. SOPs (Inbound Only) ============
  try {
    const sops = await fetchRealSOPs();
    for (const s of sops) {
      try {
        await run(
          `INSERT OR REPLACE INTO sops (id, timestamp, position_name, kra_id, text, checklist, form_fields, doc_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.timestamp, s.position_name, s.kra_id, s.text, s.checklist, s.form_fields, s.doc_link]
        );
        summary.sops++;
      } catch (err) {
        summary.errors++;
        console.error(`[Sync Inbound] SOP ${s.id} error:`, err.message);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] SOPs fetch error:', err.message);
  }

  // ============ E. User Task Configurations (Two-Way — skip if DB is newer) ============
  try {
    const configs = await fetchRealUserConfigs();
    for (let i = 0; i < configs.length; i += 15) {
      const chunk = configs.slice(i, i + 15);
      await Promise.all(chunk.map(async (c) => {
        try {
          // Check if DB already has a newer version
          const existing = await get(`SELECT last_updated FROM user_configs WHERE employee_id = ?`, [c.employee_id]);
          if (existing && toTimestampMs(existing.last_updated) > toTimestampMs(c.last_updated)) {
            summary.skippedNewerInDb++;
            return;
          }
          await run(
            `INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`,
            [c.employee_id, c.config_json, c.last_updated]
          );
          summary.configs++;
        } catch (err) {
          summary.errors++;
          console.error(`[Sync Inbound] Config ${c.employee_id} error:`, err.message);
        }
      }));
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] Configs fetch error:', err.message);
  }

  // ============ F. Daily Reports (Two-Way — skip if DB is newer) ============
  try {
    const reports = await fetchRealDailyReports();
    console.log(`[Sync Inbound] Processing ${reports.length} daily reports from Sheets...`);
    
    for (let i = 0; i < reports.length; i += 10) {
      const chunk = reports.slice(i, i + 10);
      await Promise.all(chunk.map(async (r) => {
        try {
          const dateNorm = normalizeDateToDDMMYYYY(r.date);
          const empId = String(r.employee_id).trim();
          
          // Check if DB already has a newer version of this report
          const existing = await get(
            `SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`,
            [dateNorm, empId]
          );
          
          if (existing && toTimestampMs(existing.last_updated) > toTimestampMs(r.last_updated)) {
            summary.skippedNewerInDb++;
            return; // DB is newer — don't overwrite
          }

          // Merge: if Sheets has null/empty for a field, but DB already has a value, keep DB value!
          const safeBod = (r.bod_data && r.bod_data !== '' && r.bod_data !== '{}') ? safeJsonString(r.bod_data) : (existing?.bod_data || null);
          const safeEod = (r.eod_data && r.eod_data !== '' && r.eod_data !== '{}' && r.eod_data !== 'null') ? safeJsonString(r.eod_data) : (existing?.eod_data || null);
          const hasEod = Boolean(safeEod && safeEod !== '' && safeEod !== '{}' && safeEod !== 'null');

          const todayDateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
          const isTodayReport = (dateNorm === todayDateStr || r.date === todayDateStr);
          let safeApprovalStatus = r.approval_status || existing?.approval_status;
          
          // Safeguard 0: Today's reports can NEVER be Auto Approved on the same day!
          if (isTodayReport && safeApprovalStatus === 'Auto Approved') {
            safeApprovalStatus = hasEod ? 'Pending Review' : 'Pending EOD';
          }

          // Safeguard 1: If DB is already 'Approved', it can NEVER be changed or downgraded to 'Auto Approved'
          if (existing?.approval_status === 'Approved') {
            safeApprovalStatus = 'Approved';
          } else if (existing?.approval_status === 'Auto Approved') {
            if (r.approval_status === 'Approved') {
              safeApprovalStatus = 'Approved'; // Head manual approval upgrades Auto Approved
            } else if (r.approval_status !== 'Approved' && r.approval_status !== 'Auto Approved') {
              safeApprovalStatus = existing.approval_status;
            }
          }

          // Safeguard 2: If EOD was submitted (or eod_submitted_at exists), it can NEVER be 'EOD Missed'
          if (hasEod || existing?.eod_submitted_at) {
            if (safeApprovalStatus === 'EOD Missed' || !safeApprovalStatus) {
              safeApprovalStatus = (existing?.approval_status === 'Approved' || existing?.approval_status === 'Auto Approved')
                ? existing.approval_status
                : 'Pending Review';
            }
          } else {
            if (isTodayReport) {
              safeApprovalStatus = 'Pending EOD';
            } else {
              safeApprovalStatus = 'EOD Missed';
            }
          }

          const safeSysScore = hasEod ? sanitizeScore(
            r.system_score != null && r.system_score > 0
              ? r.system_score
              : (existing?.system_score && existing.system_score > 0 ? existing.system_score : null)
          ) : null;
          let safeHeadRating = hasEod ? (r.head_rating != null ? r.head_rating : (existing?.head_rating ?? (safeApprovalStatus === 'Auto Approved' || safeApprovalStatus === 'Approved' ? 100 : null))) : null;
          let safeFinalScore = hasEod ? sanitizeScore(
            r.final_score != null && r.final_score > 0
              ? r.final_score
              : (existing?.final_score && existing.final_score > 0 ? existing.final_score : safeSysScore)
          ) : null;
          if (hasEod && (!safeFinalScore || safeFinalScore === 0) && safeSysScore > 0) {
            safeFinalScore = safeSysScore;
          }
          const safeAttendance = r.attendance || existing?.attendance || 'Present';
          const safeOvertime = r.overtime != null ? r.overtime : (existing?.overtime ?? 0);
          const safeRatingUpdated = r.rating_last_updated || existing?.rating_last_updated || null;
          const safeRatingEditedBy = r.rating_edited_by || existing?.rating_edited_by || null;
          let safeApprovalTimestamp = r.approval_timestamp || existing?.approval_timestamp || null;
          let safeExpiryTimestamp = r.expiry_timestamp || existing?.expiry_timestamp || null;
          
          const isHumanReviewer = (
            (r.rated_by && !r.rated_by.toLowerCase().includes('system')) ||
            (existing?.rated_by && !existing.rated_by.toLowerCase().includes('system')) ||
            (safeRatingEditedBy && !safeRatingEditedBy.toLowerCase().includes('system'))
          );

          let safeRatedBy = null;
          if (r.rated_by && !r.rated_by.toLowerCase().includes('system')) {
            safeRatedBy = r.rated_by;
          } else if (existing?.rated_by && !existing.rated_by.toLowerCase().includes('system')) {
            safeRatedBy = existing.rated_by;
          } else if (safeRatingEditedBy && !safeRatingEditedBy.toLowerCase().includes('system')) {
            safeRatedBy = safeRatingEditedBy;
          } else if (safeApprovalStatus === 'Auto Approved') {
            safeRatedBy = 'System (Auto Approval)';
          } else {
            safeRatedBy = r.rated_by || existing?.rated_by || null;
          }

          if (isHumanReviewer) {
            safeApprovalStatus = 'Approved';
          }

          let safeRatedOn = (r.rated_on || existing?.rated_on || (safeApprovalStatus === 'Auto Approved' ? (existing?.last_updated || new Date().toISOString()) : null));

          if (isTodayReport && safeApprovalStatus === 'Pending Review') {
            safeHeadRating = null;
            safeRatedBy = null;
            safeRatedOn = null;
            safeApprovalTimestamp = null;
            safeFinalScore = safeSysScore;
            safeExpiryTimestamp = '04/10/2026 23:59:59';
          }
          const safeFineAmount = r.fine_amount != null ? r.fine_amount : (existing?.fine_amount ?? null);
          const safeFineReason = r.fine_reason || existing?.fine_reason || null;
          const safeFineDocUrl = r.fine_doc_url || existing?.fine_doc_url || null;
          const safeFineDocName = r.fine_doc_name || existing?.fine_doc_name || null;
          const safeFineIssuedOn = r.fine_issued_on || existing?.fine_issued_on || null;
          const safeFineIssuedBy = r.fine_issued_by || existing?.fine_issued_by || null;
          const safeFineStatus = r.fine_status || existing?.fine_status || null;
          const safeRemarks = r.employee_remarks || existing?.employee_remarks || null;
          const safeBodSubmittedAt = existing?.bod_submitted_at || (safeBod ? (existing?.last_updated || existing?.createdAt || r.last_updated || new Date().toISOString()) : null);
          const safeEodSubmittedAt = existing?.eod_submitted_at || (hasEod ? (existing?.last_updated || existing?.createdAt || r.last_updated || new Date().toISOString()) : null);

          await run(
            `INSERT OR REPLACE INTO daily_reports (
              date, employee_id, department, bod_data, eod_data,
              system_score, last_updated, head_rating, final_score,
              attendance, overtime, rating_last_updated, rating_edited_by,
              approval_status, approval_timestamp, expiry_timestamp,
              rated_by, rated_on, fine_amount, fine_reason,
              fine_doc_url, fine_doc_name, fine_issued_on, fine_issued_by,
              fine_status, employee_remarks, bod_submitted_at, eod_submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              dateNorm, empId, r.department || existing?.department || '',
              safeBod, safeEod,
              safeSysScore, r.last_updated || existing?.last_updated || null,
              safeHeadRating, safeFinalScore,
              safeAttendance, safeOvertime,
              safeRatingUpdated, safeRatingEditedBy,
              safeApprovalStatus, safeApprovalTimestamp,
              safeExpiryTimestamp, safeRatedBy,
              safeRatedOn, safeFineAmount, safeFineReason,
              safeFineDocUrl, safeFineDocName,
              safeFineIssuedOn, safeFineIssuedBy,
              safeFineStatus, safeRemarks,
              safeBodSubmittedAt, safeEodSubmittedAt
            ]
          );
          summary.reports++;
        } catch (err) {
          summary.errors++;
          console.error(`[Sync Inbound] Report ${r.date}/${r.employee_id} error:`, err.message);
        }
      }));
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] Daily Reports fetch error:', err.message);
  }

  // ============ G. Fines (Two-Way — upsert by fine ID) ============
  try {
    const fines = await fetchRealFines();
    for (const f of fines) {
      try {
        await run(
          `INSERT OR REPLACE INTO fines (
            id, employee_id, date, amount, reason, doc_url, doc_name, issued_on, issued_by, status, employee_remarks, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [f.id, f.employee_id, f.date, f.amount, f.reason, f.doc_url || null, f.doc_name || null,
           f.issued_on || null, f.issued_by || null, f.status || 'Pending', f.employee_remarks || '', f.last_updated || new Date().toISOString()]
        );
        summary.fines++;
      } catch (err) {
        summary.errors++;
        console.error(`[Sync Inbound] Fine ${f.id} error:`, err.message);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Inbound] Fines fetch error:', err.message);
  }

  // Automatically check and approve overdue reports after inbound sync
  try {
    await checkAutoApprovals();
  } catch (autoErr) {
    console.warn('[Sync Inbound] Auto-approval check notice:', autoErr.message);
  }

  return summary;
}

/**
 * 2. OUTBOUND SYNC: Database -> Google Sheets
 * 
 * Pushes all DB records that may differ from Sheets.
 * Uses batch updates for efficiency.
 */
export async function syncOutbound() {
  const summary = { reportsSynced: 0, finesSynced: 0, configsSynced: 0, deptsSynced: 0, errors: 0 };
  const isPg = getIsPostgres();

  // ============ A. Daily Reports (DB -> Sheets) ============
  try {
    const existingData = await readSheet(APP_DB_ID, 'Daily_Reports');
    const existingMap = new Map(); // key -> { rowNum, lastUpdated, rowData }
    if (existingData && existingData.length > 1) {
      for (let i = 1; i < existingData.length; i++) {
        const row = existingData[i];
        if (row[0] && row[1]) {
          const normDate = normalizeDateToDDMMYYYY(row[0]);
          const normKey = `${normDate}___${String(row[1]).trim().toUpperCase()}`;
          existingMap.set(normKey, {
            rowNum: i + 1,
            lastUpdated: row[6] || null,
            rowData: row
          });
        }
      }
    }

    const orderClause = isPg
      ? 'ORDER BY last_updated DESC NULLS LAST'
      : 'ORDER BY last_updated DESC';
    const recentReports = await query(
      `SELECT * FROM daily_reports WHERE date IS NOT NULL ${orderClause}`
    );

    const batchUpdates = [];
    const newReportsToAppend = [];

    for (const r of recentReports) {
      const normDate = normalizeDateToDDMMYYYY(r.date);
      const key = `${normDate}___${String(r.employee_id).trim().toUpperCase()}`;
      const existing = existingMap.get(key);

      const mergeOutboundVal = (dbVal, colIdx, fallback = '') => {
        if (dbVal !== undefined && dbVal !== null && dbVal !== '') {
          return dbVal;
        }
        if (existing && existing.rowData && existing.rowData[colIdx] !== undefined && existing.rowData[colIdx] !== null && existing.rowData[colIdx] !== '') {
          return existing.rowData[colIdx];
        }
        return fallback;
      };

      // Force date to be treated as plain text string literal by prefixing with '
      // This prevents Google Sheets from converting DD/MM/YYYY into an Excel serial number like 46277
      const formattedDate = normDate.startsWith("'") ? normDate : `'${normDate}`;
      const rawLastUpdated = formatIndianDateTime(r.last_updated || new Date());
      const formattedLastUpdated = rawLastUpdated.startsWith("'") ? rawLastUpdated : `'${rawLastUpdated}`;

      const hasEod = Boolean(r.eod_data && r.eod_data !== '' && r.eod_data !== '{}' && r.eod_data !== 'null');

      const todayDateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
      const isTodayReport = (normDate === todayDateStr || r.date === todayDateStr || r.reportDate === todayDateStr);
      const safeOutboundStatus = hasEod
        ? mergeOutboundVal(r.approval_status, 13, 'Pending Review')
        : (isTodayReport ? mergeOutboundVal(r.approval_status, 13, 'Pending EOD') : 'EOD Missed');

      const safeTs = (val) => {
        if (!val) return '';
        const s = formatIndianDateTime(val);
        return s ? (s.startsWith("'") ? s : `'${s}`) : '';
      };

      const rowValues = [
        formattedDate,
        r.employee_id,
        mergeOutboundVal(r.department, 2),
        mergeOutboundVal(r.bod_data, 3),
        hasEod ? mergeOutboundVal(r.eod_data, 4) : '',
        hasEod ? mergeOutboundVal(r.system_score, 5) : '',
        mergeOutboundVal(formattedLastUpdated, 6, `'${formatIndianDateTime()}`),
        hasEod ? (safeOutboundStatus === 'Pending Review' ? (r.head_rating != null ? r.head_rating : '') : mergeOutboundVal(r.head_rating, 7)) : '',
        hasEod ? mergeOutboundVal(r.final_score, 8) : '',
        mergeOutboundVal(r.attendance, 9, 'Present'),
        mergeOutboundVal(r.overtime, 10, 0),
        mergeOutboundVal(safeTs(r.rating_last_updated), 11),
        mergeOutboundVal(r.rating_edited_by, 12),
        safeOutboundStatus,
        safeOutboundStatus === 'Pending Review' ? '' : mergeOutboundVal(safeTs(r.approval_timestamp), 14),
        mergeOutboundVal(safeTs(r.expiry_timestamp), 15),
        safeOutboundStatus === 'Pending Review' ? '' : mergeOutboundVal(r.rated_by, 16),
        safeOutboundStatus === 'Pending Review' ? '' : mergeOutboundVal(safeTs(r.rated_on), 17),
        mergeOutboundVal(r.fine_amount, 18),
        mergeOutboundVal(r.fine_reason, 19),
        mergeOutboundVal(r.fine_doc_url, 20),
        mergeOutboundVal(r.fine_doc_name, 21),
        mergeOutboundVal(safeTs(r.fine_issued_on), 22),
        mergeOutboundVal(r.fine_issued_by, 23),
        mergeOutboundVal(r.fine_status, 24),
        mergeOutboundVal(r.employee_remarks, 25)
      ];

      if (existing) {
        // Push if DB is strictly newer than Sheet, OR if approval status / ratings differ
        const dbTs = toTimestampMs(r.last_updated);
        const sheetTs = toTimestampMs(existing.lastUpdated);
        const sheetStatus = existing.rowData ? (existing.rowData[13] || '') : '';
        const sheetHeadRating = existing.rowData ? String(existing.rowData[7] ?? '') : '';
        const dbHeadRating = r.head_rating != null ? String(r.head_rating) : '';
        
        const statusChanged = safeOutboundStatus && safeOutboundStatus !== sheetStatus;
        const ratingChanged = dbHeadRating !== sheetHeadRating;

        if (dbTs > sheetTs || statusChanged || ratingChanged) {
          batchUpdates.push({
            range: `Daily_Reports!A${existing.rowNum}:Z${existing.rowNum}`,
            values: [rowValues]
          });
          summary.reportsSynced++;
        }
      } else {
        newReportsToAppend.push(rowValues);
        summary.reportsSynced++;
      }
    }

    if (newReportsToAppend.length > 0) {
      for (let i = 0; i < newReportsToAppend.length; i += 100) {
        await appendRows(APP_DB_ID, 'Daily_Reports', newReportsToAppend.slice(i, i + 100));
      }
    }

    if (batchUpdates.length > 0) {
      for (let i = 0; i < batchUpdates.length; i += 100) {
        const chunk = batchUpdates.slice(i, i + 100);
        await batchUpdateRanges(APP_DB_ID, chunk);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Outbound] Daily Reports error:', err.message);
  }

  // ============ B. Fines (DB -> Sheets) — find-and-update by FineID ============
  try {
    const finesData = await readSheet(APP_DB_ID, 'Fines').catch(() => []);
    const fineRowMap = new Map(); // fineId -> { rowNum, lastUpdated, rowData }
    if (finesData && finesData.length > 1) {
      for (let i = 1; i < finesData.length; i++) {
        if (finesData[i][0]) {
          fineRowMap.set(finesData[i][0].toString().trim(), {
            rowNum: i + 1,
            lastUpdated: finesData[i][11] || null,
            rowData: finesData[i]
          });
        }
      }
    }

    const fines = await query(`SELECT * FROM fines ORDER BY last_updated DESC`);
    const fineBatchUpdates = [];
    const newFinesToAppend = [];

    for (const f of fines) {
      const fineId = String(f.id).trim();
      const existing = fineRowMap.get(fineId);

      const mergeFineOutbound = (dbVal, colIdx, fallback = '') => {
        if (dbVal !== undefined && dbVal !== null && dbVal !== '') return dbVal;
        if (existing && existing.rowData && existing.rowData[colIdx] !== undefined && existing.rowData[colIdx] !== null && existing.rowData[colIdx] !== '') {
          return existing.rowData[colIdx];
        }
        return fallback;
      };

      const rowValues = [
        fineId,
        mergeFineOutbound(f.employee_id, 1),
        mergeFineOutbound(f.date, 2),
        mergeFineOutbound(f.amount, 3),
        mergeFineOutbound(f.reason, 4),
        mergeFineOutbound(f.doc_url, 5),
        mergeFineOutbound(f.doc_name, 6),
        mergeFineOutbound(f.issued_on, 7),
        mergeFineOutbound(f.issued_by, 8),
        mergeFineOutbound(f.status, 9, 'Pending'),
        mergeFineOutbound(f.employee_remarks, 10),
        mergeFineOutbound(f.last_updated, 11, new Date().toISOString())
      ];

      if (existing) {
        const dbTs = toTimestampMs(f.last_updated);
        const sheetTs = toTimestampMs(existing.lastUpdated);
        if (dbTs > sheetTs) {
          fineBatchUpdates.push({
            range: `Fines!A${existing.rowNum}:L${existing.rowNum}`,
            values: [rowValues]
          });
          summary.finesSynced++;
        }
      } else {
        newFinesToAppend.push(rowValues);
        summary.finesSynced++;
      }
    }

    if (newFinesToAppend.length > 0) {
      await appendRows(APP_DB_ID, 'Fines', newFinesToAppend);
    }

    if (fineBatchUpdates.length > 0) {
      await batchUpdateRanges(APP_DB_ID, fineBatchUpdates);
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Outbound] Fines error:', err.message);
  }

  // ============ C. User Configs (DB -> Sheets) — single read & diff ============
  try {
    const sheetConfigs = await readSheet(APP_DB_ID, 'User_Configs').catch(() => []);
    const configRowMap = new Map(); // employee_id -> { rowNum, lastUpdated }
    if (sheetConfigs && sheetConfigs.length > 1) {
      for (let i = 1; i < sheetConfigs.length; i++) {
        const row = sheetConfigs[i];
        if (row[0]) {
          configRowMap.set(String(row[0]).trim(), {
            rowNum: i + 1,
            lastUpdated: row[2] || null
          });
        }
      }
    }

    const dbConfigs = await query(`SELECT * FROM user_configs`);
    const configBatchUpdates = [];
    const newConfigsToAppend = [];

    for (const c of dbConfigs) {
      const empId = String(c.employee_id).trim();
      const existing = configRowMap.get(empId);
      const rowValues = [empId, c.config_json, c.last_updated];

      if (existing) {
        const dbTs = toTimestampMs(c.last_updated);
        const sheetTs = toTimestampMs(existing.lastUpdated);
        if (dbTs > sheetTs) {
          configBatchUpdates.push({
            range: `User_Configs!A${existing.rowNum}:C${existing.rowNum}`,
            values: [rowValues]
          });
          summary.configsSynced++;
        }
      } else {
        newConfigsToAppend.push(rowValues);
        summary.configsSynced++;
      }
    }

    if (newConfigsToAppend.length > 0) {
      await appendRows(APP_DB_ID, 'User_Configs', newConfigsToAppend);
    }

    if (configBatchUpdates.length > 0) {
      await batchUpdateRanges(APP_DB_ID, configBatchUpdates);
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Outbound] Configs error:', err.message);
  }

  // ============ D. Departments (DB -> Sheets — push head changes only if different) ============
  try {
    const deptData = await readSheet(MASTER_DB_ID, 'Departments').catch(() => []);
    if (deptData && deptData.length > 1) {
      const headers = deptData[0].map(h => (h || '').toString().trim());
      const nameIdx = headers.indexOf('DepartmentName');
      const headIdIdx = headers.indexOf('HeadId');
      const headNameIdx = headers.indexOf('HeadName');

      if (nameIdx >= 0 && headIdIdx >= 0 && headNameIdx >= 0) {
        const sheetDepts = new Map();
        for (let i = 1; i < deptData.length; i++) {
          const row = deptData[i];
          if (row[nameIdx]) {
            sheetDepts.set(String(row[nameIdx]).trim(), {
              rowNum: i + 1,
              headId: row[headIdIdx] || '',
              headName: row[headNameIdx] || ''
            });
          }
        }

        const dbDepts = await query(`SELECT * FROM departments WHERE head_id IS NOT NULL AND head_id != ''`);
        for (const d of dbDepts) {
          const existing = sheetDepts.get(d.name);
          if (existing) {
            const dbHeadId = String(d.head_id || '').trim();
            const sheetHeadId = String(existing.headId || '').trim();
            if (dbHeadId !== sheetHeadId) {
              const colLetterHeadId = String.fromCharCode(65 + headIdIdx);
              const colLetterHeadName = String.fromCharCode(65 + headNameIdx);
              await updateRange(MASTER_DB_ID, `Departments!${colLetterHeadId}${existing.rowNum}`, [[d.head_id || '']]);
              await updateRange(MASTER_DB_ID, `Departments!${colLetterHeadName}${existing.rowNum}`, [[d.head_name || '']]);
              summary.deptsSynced++;
            }
          }
        }
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[Sync Outbound] Departments error:', err.message);
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
        message: 'Google Sheets sync disabled: No credentials configured.'
      };
    }

    console.log(`[Two-Way Sync] \u{1F680} Starting ${triggeredBy} two-way synchronization...`);

    // Inbound: Pull Google Sheets -> DB
    const inboundSummary = await syncInbound();
    console.log(`[Two-Way Sync] \u{1F4E5} Inbound complete:`, JSON.stringify(inboundSummary));

    // Outbound: Push DB -> Google Sheets
    const outboundSummary = await syncOutbound();
    console.log(`[Two-Way Sync] \u{1F4E4} Outbound complete:`, JSON.stringify(outboundSummary));

    const completedAt = new Date().toISOString();
    const finalSummary = { inbound: inboundSummary, outbound: outboundSummary, triggeredBy };

    try {
      await run(
        `INSERT OR REPLACE INTO sync_logs (id, started_at, completed_at, direction, status, summary, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [logId, startedAt, completedAt, 'BIDIRECTIONAL', 'SUCCESS', JSON.stringify(finalSummary), null]
      );
    } catch (logErr) {
      console.warn('[Two-Way Sync] Failed to record sync log:', logErr.message);
    }

    lastSyncTime = completedAt;
    lastSyncStatus = 'SUCCESS';
    lastSyncSummary = finalSummary;
    isSyncing = false;

    console.log(`[Two-Way Sync] \u2705 Bidirectional sync finished successfully at ${completedAt}`);
    return { success: true, timestamp: completedAt, summary: finalSummary };

  } catch (err) {
    const completedAt = new Date().toISOString();
    console.error('[Two-Way Sync] \u274C Error during bidirectional sync:', err.message);

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

  console.log(`[Two-Way Sync] \u23F0 Background auto-sync scheduled every ${Math.round(intervalMs / 60000)} minutes.`);
  autoSyncInterval = setInterval(() => {
    runTwoWaySync('AUTO')
      .then(() => checkAutoApprovals())
      .catch(err => {
        console.warn('[Two-Way Sync] Background run notice:', err.message);
      });
  }, intervalMs);

  // Run a background sync 10 seconds after server launch
  setTimeout(() => {
    runTwoWaySync('BOOT')
      .then(() => checkAutoApprovals())
      .catch(err => {
        console.log('[Two-Way Sync] Initial boot sync notice:', err.message);
      });
  }, 10000);
}
