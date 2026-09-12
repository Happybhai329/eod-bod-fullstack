/**
 * Google Sheets Integration Module
 * 
 * Connects to the REAL Google Sheets databases using Service Account credentials.
 * Provides read/write access to all 3 spreadsheets:
 *   - MASTER_DB (Employees, Departments)
 *   - APP_DB (Daily_Reports, User_Configs, Fines, Notifications)
 *   - KRA_SOP_DB (KRAs, SOPs)
 */

import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalize any date string to DD/MM/YYYY format.
 * Handles: DD/MM/YYYY, YYYY-MM-DD, M/D/YYYY, MM/DD/YYYY, Date objects.
 * Returns original string if it can't parse.
 */
export function normalizeDateToDDMMYYYY(dateVal) {
  if (!dateVal) return '';
  const s = String(dateVal).trim();
  if (!s) return '';

  // Handle Excel / Sheets numeric serial date (e.g., 46235 -> August 2026)
  const num = Number(s);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  // Already DD/MM/YYYY or D/M/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1], 10);
    const m = parseInt(ddmmyyyy[2], 10);
    if (d > 12) return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${ddmmyyyy[3]}`;
    if (m > 12) return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${ddmmyyyy[3]}`;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${ddmmyyyy[3]}`;
  }

  // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // JavaScript Date parse only if it has date separators
  if (/[-/,]/.test(s)) {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const yyyy = parsed.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  return s;
}

/**
 * Format timestamp to DD/MM/YYYY HH:mm:ss in Asia/Kolkata timezone (matching code.gs)
 */
export function formatIndianDateTime(d = new Date()) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

// Spreadsheet IDs — read from .env, fallback to hardcoded values from code.gs
const MASTER_DB_ID = process.env.MASTER_DB_SPREADSHEET_ID || '1AxdiOpaij8Lnx0TV5iMhgVlADfN0LeXzwOdmbzmrlGA';
const APP_DB_ID = process.env.APP_DB_SPREADSHEET_ID || '1IFGc0kvv9LpbZUfEGroY8PevevJ8axdPApVrLjidlw8';
const KRA_SOP_DB_ID = process.env.KRA_SOP_DB_SPREADSHEET_ID || '1G1hzmhU-CV2XKUWSLSt1SPgCR6wmoXqwBdxFb33TSsU';

let sheetsClient = null;

/**
 * Initialize Google Sheets API client using Service Account
 */
export async function initGoogleSheets() {
  let credentials = null;

  // 1. Check environment variables (ideal for Render cloud deployment)
  const envKey = process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (envKey) {
    try {
      if (envKey.trim().startsWith('{')) {
        credentials = JSON.parse(envKey.trim());
      } else {
        // Handle potential base64 encoded JSON
        const decoded = Buffer.from(envKey, 'base64').toString('utf-8');
        credentials = JSON.parse(decoded);
      }
    } catch (e) {
      console.warn('[Google Sheets] Failed to parse credentials from environment variable:', e.message);
    }
  }

  // 2. Check local credentials file
  if (!credentials) {
    const credPath = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credPath)) {
      try {
        credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      } catch (e) {
        console.warn('[Google Sheets] Failed to parse credentials.json file:', e.message);
      }
    }
  }

  if (!credentials) {
    console.log('[Google Sheets] No credentials configured. Sheets backup will be disabled.');
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  console.log('[Google Sheets] Connected with service account:', credentials.client_email);
  return sheetsClient;
}

/**
 * Read all data from a specific sheet tab
 */
export async function readSheet(spreadsheetId, sheetName) {
  if (!sheetsClient) await initGoogleSheets();
  if (!sheetsClient) throw new Error('Google Sheets client not initialized');

  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    });
    return response.data.values || [];
  } catch (err) {
    console.error(`[Google Sheets] Error reading ${sheetName} from ${spreadsheetId}:`, err.message);
    throw err;
  }
}

/**
 * Write/append a row to a sheet
 */
export async function appendRow(spreadsheetId, sheetName, values) {
  if (!sheetsClient) await initGoogleSheets();
  if (!sheetsClient) throw new Error('Google Sheets client not initialized');

  try {
    const response = await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
    return response.data;
  } catch (err) {
    console.error(`[Google Sheets] Error appending to ${sheetName}:`, err.message);
    throw err;
  }
}

/**
 * Batch append multiple rows to a sheet in a single API call
 */
export async function appendRows(spreadsheetId, sheetName, rows) {
  if (!rows || rows.length === 0) return null;
  if (!sheetsClient) await initGoogleSheets();
  if (!sheetsClient) throw new Error('Google Sheets client not initialized');

  try {
    const response = await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
    return response.data;
  } catch (err) {
    console.error(`[Google Sheets] Error batch appending to ${sheetName}:`, err.message);
    throw err;
  }
}

/**
 * Update a specific row range in a sheet
 */
export async function updateRange(spreadsheetId, range, values) {
  if (!sheetsClient) await initGoogleSheets();
  if (!sheetsClient) throw new Error('Google Sheets client not initialized');

  try {
    const response = await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return response.data;
  } catch (err) {
    console.error(`[Google Sheets] Error updating ${range}:`, err.message);
    throw err;
  }
}

/**
 * Batch update multiple ranges in a single Google Sheets API call
 */
export async function batchUpdateRanges(spreadsheetId, data) {
  if (!data || data.length === 0) return null;
  if (!sheetsClient) await initGoogleSheets();
  if (!sheetsClient) throw new Error('Google Sheets client not initialized');

  try {
    const response = await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });
    return response.data;
  } catch (err) {
    console.error(`[Google Sheets] Error batch updating in ${spreadsheetId}:`, err.message);
    throw err;
  }
}

// ==========================================
// MASTER_DB READERS (Employees & Departments)
// ==========================================

/**
 * Fetch all employees from the real Google Sheets MASTER_DB
 */
export async function fetchRealEmployees() {
  const data = await readSheet(MASTER_DB_ID, 'Employees');
  if (!data || data.length < 2) return [];

  const headers = data[0].map(h => h.toString().trim());
  const idIdx = headers.indexOf('EmployeeID');
  const nameIdx = headers.indexOf('Name');
  const deptIdx = headers.indexOf('Department');
  const statusIdx = headers.indexOf('Status');
  const roleIdx = headers.indexOf('Role');
  const subDeptIdx = headers.indexOf('Sub_Department');
  const otherDeptIdx = headers.indexOf('Other_Department');
  const designationIdx = headers.indexOf('Designation');

  const employees = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = idIdx >= 0 && row[idIdx] ? row[idIdx].toString().trim() : '';
    if (!id) continue;

    employees.push({
      id,
      name: nameIdx >= 0 && row[nameIdx] ? row[nameIdx].toString().trim() : '',
      department: deptIdx >= 0 && row[deptIdx] ? row[deptIdx].toString().trim() : '',
      sub_department: subDeptIdx >= 0 && row[subDeptIdx] ? row[subDeptIdx].toString().trim() : '',
      other_department: otherDeptIdx >= 0 && row[otherDeptIdx] ? row[otherDeptIdx].toString().trim() : '',
      designation: designationIdx >= 0 && row[designationIdx] ? row[designationIdx].toString().trim() : '',
      role: roleIdx >= 0 && row[roleIdx] ? row[roleIdx].toString().trim() : 'Employee',
      status: statusIdx >= 0 && row[statusIdx] ? row[statusIdx].toString().trim() : 'Active',
    });
  }

  console.log(`[Google Sheets] Fetched ${employees.length} real employees from MASTER_DB`);
  return employees;
}

/**
 * Fetch all departments from the real Google Sheets MASTER_DB
 */
export async function fetchRealDepartments() {
  const data = await readSheet(MASTER_DB_ID, 'Departments');
  if (!data || data.length < 2) return [];

  const headers = data[0].map(h => h.toString().trim());
  const nameIdx = headers.indexOf('DepartmentName');
  const parentIdx = headers.indexOf('ParentDepartment');
  const headIdIdx = headers.indexOf('HeadId');
  const headNameIdx = headers.indexOf('HeadName');

  const departments = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = nameIdx >= 0 && row[nameIdx] ? row[nameIdx].toString().trim() : '';
    if (!name) continue;

    const parent = parentIdx >= 0 && row[parentIdx] ? row[parentIdx].toString().trim() : '';
    departments.push({
      name,
      parent,
      head_id: headIdIdx >= 0 && row[headIdIdx] ? row[headIdIdx].toString().trim() : '',
      head_name: headNameIdx >= 0 && row[headNameIdx] ? row[headNameIdx].toString().trim() : '',
      is_main: !parent || parent.toLowerCase() === name.toLowerCase() ? 1 : 0,
    });
  }

  console.log(`[Google Sheets] Fetched ${departments.length} real departments from MASTER_DB`);
  return departments;
}

// ==========================================
// APP_DB READERS (Reports, Configs, Fines, Notifications)
// ==========================================

/**
 * Fetch all user task configurations from APP_DB
 */
export async function fetchRealUserConfigs() {
  const data = await readSheet(APP_DB_ID, 'User_Configs');
  if (!data || data.length < 2) return [];

  const configs = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    configs.push({
      employee_id: row[0].toString().trim(),
      config_json: row[1] ? row[1].toString() : '[]',
      last_updated: row[2] ? row[2].toString() : new Date().toISOString(),
    });
  }

  console.log(`[Google Sheets] Fetched ${configs.length} real user configs from APP_DB`);
  return configs;
}

/**
 * Fetch all daily reports from APP_DB
 *
 * In Google Sheets 'Daily_Reports', rows 2..N strictly follow columns A through Z (0 to 25)
 * matching the reference Google Apps Script application (code.gs constants COL_DATE=1..COL_EMPLOYEE_REMARKS=26).
 * Standard positional indexing is used because row 1 in the live sheet has empty and shifted header titles.
 */
export async function fetchRealDailyReports() {
  const data = await readSheet(APP_DB_ID, 'Daily_Reports');
  if (!data || data.length < 2) return [];

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const n = parseFloat(String(val).replace('%', '').trim());
    return isNaN(n) ? null : n;
  };

  const reports = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rawDate = row[0];
    const rawEmpId = row[1];
    if (!rawDate || !rawEmpId) continue;

    const dateStr = normalizeDateToDDMMYYYY(rawDate);
    const empId = String(rawEmpId).trim();

    reports.push({
      date: dateStr,
      employee_id: empId,
      department: row[2] ? String(row[2]).trim() : '',
      bod_data: row[3] || null,
      eod_data: row[4] || null,
      system_score: parseNum(row[5]),
      last_updated: row[6] ? String(row[6]).trim() : null,
      head_rating: parseNum(row[7]),
      final_score: parseNum(row[8]),
      attendance: row[9] ? String(row[9]).trim() : 'Present',
      overtime: parseNum(row[10]) ?? 0,
      rating_last_updated: row[11] ? String(row[11]).trim() : null,
      rating_edited_by: row[12] ? String(row[12]).trim() : null,
      approval_status: row[13] ? String(row[13]).trim() : 'Pending Review',
      approval_timestamp: row[14] ? String(row[14]).trim() : null,
      expiry_timestamp: row[15] ? String(row[15]).trim() : null,
      rated_by: row[16] ? String(row[16]).trim() : null,
      rated_on: row[17] ? String(row[17]).trim() : null,
      fine_amount: parseNum(row[18]),
      fine_reason: row[19] ? String(row[19]) : null,
      fine_doc_url: row[20] ? String(row[20]) : null,
      fine_doc_name: row[21] ? String(row[21]) : null,
      fine_issued_on: row[22] ? String(row[22]) : null,
      fine_issued_by: row[23] ? String(row[23]).trim() : null,
      fine_status: row[24] ? String(row[24]).trim() : null,
      employee_remarks: row[25] ? String(row[25]) : null,
    });
  }

  console.log(`[Google Sheets] Fetched ${reports.length} real daily reports from APP_DB`);
  return reports;
}

/**
 * Fetch all fines from APP_DB
 */
export async function fetchRealFines() {
  try {
    const data = await readSheet(APP_DB_ID, 'Fines');
    if (!data || data.length < 2) return [];

    const fines = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      fines.push({
        id: row[0].toString().trim(),
        employee_id: row[1] ? row[1].toString().trim() : '',
        date: row[2] ? row[2].toString().trim() : '',
        amount: row[3] ? parseFloat(row[3]) : 0,
        reason: row[4] ? row[4].toString() : '',
        doc_url: row[5] || null,
        doc_name: row[6] || null,
        issued_on: row[7] || null,
        issued_by: row[8] || null,
        status: row[9] || 'Pending',
        employee_remarks: row[10] || null,
        last_updated: row[11] || null,
      });
    }

    console.log(`[Google Sheets] Fetched ${fines.length} real fines from APP_DB`);
    return fines;
  } catch (err) {
    console.warn('[Google Sheets] Fines sheet may not exist yet:', err.message);
    return [];
  }
}

/**
 * Fetch all notifications from APP_DB
 */
export async function fetchRealNotifications() {
  try {
    const data = await readSheet(APP_DB_ID, 'Notifications');
    if (!data || data.length < 2) return [];

    const notifications = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      notifications.push({
        id: row[0].toString().trim(),
        employee_id: row[1] ? row[1].toString().trim() : '',
        type: row[2] ? row[2].toString() : '',
        message: row[3] ? row[3].toString() : '',
        created_on: row[4] || new Date().toISOString(),
        read: row[5] ? (row[5].toString().toLowerCase() === 'true' || row[5] === '1' ? 1 : 0) : 0,
      });
    }

    console.log(`[Google Sheets] Fetched ${notifications.length} real notifications from APP_DB`);
    return notifications;
  } catch (err) {
    console.warn('[Google Sheets] Notifications sheet may not exist yet:', err.message);
    return [];
  }
}

// ==========================================
// KRA_SOP_DB READERS
// ==========================================

/**
 * Fetch all KRAs from KRA_SOP_DB
 */
export async function fetchRealKRAs() {
  try {
    const data = await readSheet(KRA_SOP_DB_ID, 'KRAs');
    if (!data || data.length < 2) return [];

    const kras = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      kras.push({
        id: row[0].toString().trim(),
        timestamp: row[1] || null,
        position_name: row[2] ? row[2].toString().trim() : '',
        text: row[3] ? row[3].toString() : '',
        type: row[4] ? row[4].toString() : '',
      });
    }

    console.log(`[Google Sheets] Fetched ${kras.length} real KRAs from KRA_SOP_DB`);
    return kras;
  } catch (err) {
    console.warn('[Google Sheets] KRAs sheet error:', err.message);
    return [];
  }
}

/**
 * Fetch all SOPs from KRA_SOP_DB
 */
export async function fetchRealSOPs() {
  try {
    const data = await readSheet(KRA_SOP_DB_ID, 'SOPs');
    if (!data || data.length < 2) return [];

    const sops = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      sops.push({
        id: row[0].toString().trim(),
        timestamp: row[1] || null,
        position_name: row[2] ? row[2].toString().trim() : '',
        kra_id: row[3] ? row[3].toString().trim() : '',
        text: row[4] ? row[4].toString() : '',
        checklist: row[5] || null,
        form_fields: row[6] || null,
        doc_link: row[7] || null,
      });
    }

    console.log(`[Google Sheets] Fetched ${sops.length} real SOPs from KRA_SOP_DB`);
    return sops;
  } catch (err) {
    console.warn('[Google Sheets] SOPs sheet error:', err.message);
    return [];
  }
}

// ==========================================
// OUTBOX SYNC WRITERS (PostgreSQL → Google Sheets backup)
// ==========================================

/**
 * Sync a daily report row back to Google Sheets
 */
export async function syncDailyReportToSheets(report) {
  if (!report) return;
  const data = await readSheet(APP_DB_ID, 'Daily_Reports');
  if (!data || data.length === 0) return;

  const targetDate = normalizeDateToDDMMYYYY(report.date);
  const targetEmpId = String(report.employee_id || '').trim().toUpperCase();

  // Find existing row by date + employee_id (normalized comparison)
  let targetRow = -1;
  let existingRow = null;
  for (let i = 1; i < data.length; i++) {
    const rowDate = normalizeDateToDDMMYYYY(data[i][0]);
    const rowEmpId = String(data[i][1] || '').trim().toUpperCase();
    if (rowDate === targetDate && rowEmpId === targetEmpId) {
      targetRow = i + 1; // 1-indexed for Sheets API
      existingRow = data[i];
      break;
    }
  }

  // Safe merge helper: use report's value if provided; otherwise retain existing sheet value
  const mergeVal = (newVal, existingColIdx, fallback = '') => {
    if (newVal !== undefined && newVal !== null && newVal !== '') {
      return newVal;
    }
    if (existingRow && existingRow[existingColIdx] !== undefined && existingRow[existingColIdx] !== null && existingRow[existingColIdx] !== '') {
      return existingRow[existingColIdx];
    }
    return fallback;
  };

  // Force date to be treated as plain text string literal by prefixing with '
  // This prevents Google Sheets from converting DD/MM/YYYY into an Excel serial number like 46277
  const formattedDate = targetDate.startsWith("'") ? targetDate : `'${targetDate}`;
  const formattedLastUpdated = formatIndianDateTime(report.last_updated || new Date());

  const rowValues = [
    formattedDate,                                                  // 0: Date
    report.employee_id,                                             // 1: EmployeeID
    mergeVal(report.department, 2),                                 // 2: Department
    mergeVal(report.bod_data, 3),                                   // 3: BOD_Data
    mergeVal(report.eod_data, 4),                                   // 4: EOD_Data
    mergeVal(report.system_score, 5),                               // 5: System_Score_%
    mergeVal(formattedLastUpdated, 6, formatIndianDateTime()),      // 6: Last_Updated
    mergeVal(report.head_rating, 7),                                // 7: Head_Rating
    mergeVal(report.final_score, 8),                                // 8: Final_Score_%
    mergeVal(report.attendance, 9, 'Present'),                      // 9: Attendance
    mergeVal(report.overtime, 10, 0),                               // 10: Overtime
    mergeVal(report.rating_last_updated ? formatIndianDateTime(report.rating_last_updated) : '', 11), // 11: Rating_Last_Updated
    mergeVal(report.rating_edited_by, 12),                          // 12: Rating_Edited_By
    mergeVal(report.approval_status, 13, 'Pending Review'),         // 13: Approval_Status
    mergeVal(report.approval_timestamp ? formatIndianDateTime(report.approval_timestamp) : '', 14),   // 14: Approval_Timestamp
    mergeVal(report.expiry_timestamp ? formatIndianDateTime(report.expiry_timestamp) : '', 15),       // 15: Expiry_Timestamp
    mergeVal(report.rated_by, 16),                                  // 16: Rated_By
    mergeVal(report.rated_on ? formatIndianDateTime(report.rated_on) : '', 17),                         // 17: Rated_On
    mergeVal(report.fine_amount, 18),                               // 18: Fine_Amount
    mergeVal(report.fine_reason, 19),                               // 19: Fine_Reason
    mergeVal(report.fine_doc_url, 20),                              // 20: Fine_Document_URL
    mergeVal(report.fine_doc_name, 21),                             // 21: Fine_Document_Name
    mergeVal(report.fine_issued_on ? formatIndianDateTime(report.fine_issued_on) : '', 22),           // 22: Fine_Issued_On
    mergeVal(report.fine_issued_by, 23),                            // 23: Fine_Issued_By
    mergeVal(report.fine_status, 24),                               // 24: Fine_Status
    mergeVal(report.employee_remarks, 25)                           // 25: Employee_Remarks
  ];

  if (targetRow > 0) {
    await updateRange(APP_DB_ID, `Daily_Reports!A${targetRow}:Z${targetRow}`, [rowValues]);
    console.log(`[Google Sheets] 📤 Updated row ${targetRow} in Daily_Reports for ${targetEmpId} on ${targetDate}`);
  } else {
    await appendRow(APP_DB_ID, 'Daily_Reports', rowValues);
    console.log(`[Google Sheets] 📤 Appended new row in Daily_Reports for ${targetEmpId} on ${targetDate}`);
  }
}

/**
 * Sync a fine record back to Google Sheets
 */
export async function syncFineToSheets(fine) {
  if (!fine) return;
  try {
    const data = await readSheet(APP_DB_ID, 'Fines');
    let targetRow = -1;
    let existingRow = null;
    if (data && data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString().trim() === String(fine.id).trim()) {
          targetRow = i + 1;
          existingRow = data[i];
          break;
        }
      }
    }

    const mergeFineVal = (newVal, existingIdx, fallback = '') => {
      if (newVal !== undefined && newVal !== null && newVal !== '') return newVal;
      if (existingRow && existingRow[existingIdx] !== undefined && existingRow[existingIdx] !== null && existingRow[existingIdx] !== '') {
        return existingRow[existingIdx];
      }
      return fallback;
    };

    const rowValues = [
      fine.id,
      mergeFineVal(fine.employee_id, 1),
      mergeFineVal(fine.date, 2),
      mergeFineVal(fine.amount, 3),
      mergeFineVal(fine.reason, 4),
      mergeFineVal(fine.doc_url, 5),
      mergeFineVal(fine.doc_name, 6),
      mergeFineVal(fine.issued_on, 7),
      mergeFineVal(fine.issued_by, 8),
      mergeFineVal(fine.status, 9, 'Pending'),
      mergeFineVal(fine.employee_remarks, 10),
      mergeFineVal(fine.last_updated, 11, new Date().toISOString())
    ];

    if (targetRow > 0) {
      await updateRange(APP_DB_ID, `Fines!A${targetRow}:L${targetRow}`, [rowValues]);
      console.log(`[Google Sheets] 📤 Updated fine ${fine.id} at row ${targetRow}`);
    } else {
      await appendRow(APP_DB_ID, 'Fines', rowValues);
      console.log(`[Google Sheets] 📤 Appended new fine ${fine.id}`);
    }
  } catch (err) {
    console.warn('[Google Sheets] Fine sync error:', err.message);
  }
}

/**
 * Sync department head changes back to Google Sheets
 */
export async function syncDepartmentToSheets(dept) {
  try {
    const data = await readSheet(MASTER_DB_ID, 'Departments');
    if (!data || data.length < 2) return;
    const headers = data[0];
    const nameIdx = headers.indexOf('DepartmentName');
    const headIdIdx = headers.indexOf('HeadId');
    const headNameIdx = headers.indexOf('HeadName');

    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][nameIdx] === dept.name) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow > 0 && headIdIdx >= 0 && headNameIdx >= 0) {
      const colLetterHeadId = String.fromCharCode(65 + headIdIdx);
      const colLetterHeadName = String.fromCharCode(65 + headNameIdx);
      await updateRange(MASTER_DB_ID, `Departments!${colLetterHeadId}${targetRow}`, [[dept.head_id || '']]);
      await updateRange(MASTER_DB_ID, `Departments!${colLetterHeadName}${targetRow}`, [[dept.head_name || '']]);
    }
  } catch (err) {
    console.warn('[Google Sheets] Department sync notice (ignored):', err.message);
  }
}

/**
 * Sync user task configuration back to Google Sheets
 */
export async function syncUserConfigToSheets(config) {
  try {
    const data = await readSheet(APP_DB_ID, 'User_Configs');
    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === config.employee_id) {
        targetRow = i + 1;
        break;
      }
    }

    const rowValues = [config.employee_id, config.config_json, config.last_updated];
    if (targetRow > 0) {
      await updateRange(APP_DB_ID, `User_Configs!A${targetRow}:C${targetRow}`, [rowValues]);
    } else {
      await appendRow(APP_DB_ID, 'User_Configs', rowValues);
    }
  } catch (err) {
    console.warn('[Google Sheets] User config sync notice (ignored):', err.message);
  }
}

// Export spreadsheet IDs for use elsewhere
export { MASTER_DB_ID, APP_DB_ID, KRA_SOP_DB_ID };

