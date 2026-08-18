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

// Spreadsheet IDs from code.gs
const MASTER_DB_ID = '1AxdiOpaij8Lnx0TV5iMhgVlADfN0LeXzwOdmbzmrlGA';
const APP_DB_ID = '1IFGc0kvv9LpbZUfEGroY8PevevJ8axdPApVrLjidlw8';
const KRA_SOP_DB_ID = '1G1hzmhU-CV2XKUWSLSt1SPgCR6wmoXqwBdxFb33TSsU';

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
 */
export async function fetchRealDailyReports() {
  const data = await readSheet(APP_DB_ID, 'Daily_Reports');
  if (!data || data.length < 2) return [];

  const reports = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || !row[1]) continue;
    reports.push({
      date: row[0].toString().trim(),
      employee_id: row[1].toString().trim(),
      department: row[2] ? row[2].toString().trim() : '',
      bod_data: row[3] || null,
      eod_data: row[4] || null,
      system_score: row[5] ? parseFloat(row[5]) : null,
      last_updated: row[6] || null,
      head_rating: row[7] ? parseFloat(row[7]) : null,
      final_score: row[8] ? parseFloat(row[8]) : null,
      attendance: row[9] || 'Present',
      overtime: row[10] ? parseFloat(row[10]) : 0,
      rating_last_updated: row[11] || null,
      rating_edited_by: row[12] || null,
      approval_status: row[13] || 'Pending Review',
      approval_timestamp: row[14] || null,
      expiry_timestamp: row[15] || null,
      rated_by: row[16] || null,
      rated_on: row[17] || null,
      fine_amount: row[18] ? parseFloat(row[18]) : null,
      fine_reason: row[19] || null,
      fine_doc_url: row[20] || null,
      fine_doc_name: row[21] || null,
      fine_issued_on: row[22] || null,
      fine_issued_by: row[23] || null,
      fine_status: row[24] || null,
      employee_remarks: row[25] || null,
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
  const data = await readSheet(APP_DB_ID, 'Daily_Reports');
  const headers = data[0];

  // Find existing row by date + employee_id
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === report.date && data[i][1] === report.employee_id) {
      targetRow = i + 1; // 1-indexed for Sheets API
      break;
    }
  }

  const rowValues = [
    report.date, report.employee_id, report.department,
    report.bod_data || '', report.eod_data || '',
    report.system_score || '', report.last_updated || '',
    report.head_rating || '', report.final_score || '',
    report.attendance || 'Present', report.overtime || 0,
    report.rating_last_updated || '', report.rating_edited_by || '',
    report.approval_status || '', report.approval_timestamp || '',
    report.expiry_timestamp || '', report.rated_by || '',
    report.rated_on || '', report.fine_amount || '',
    report.fine_reason || '', report.fine_doc_url || '',
    report.fine_doc_name || '', report.fine_issued_on || '',
    report.fine_issued_by || '', report.fine_status || '',
    report.employee_remarks || ''
  ];

  if (targetRow > 0) {
    await updateRange(APP_DB_ID, `Daily_Reports!A${targetRow}:Z${targetRow}`, [rowValues]);
  } else {
    await appendRow(APP_DB_ID, 'Daily_Reports', rowValues);
  }
}

/**
 * Sync a fine record back to Google Sheets
 */
export async function syncFineToSheets(fine) {
  const rowValues = [
    fine.id, fine.employee_id, fine.date, fine.amount, fine.reason,
    fine.doc_url || '', fine.doc_name || '', fine.issued_on || '',
    fine.issued_by || '', fine.status || 'Pending',
    fine.employee_remarks || '', fine.last_updated || ''
  ];
  await appendRow(APP_DB_ID, 'Fines', rowValues);
}

// Export spreadsheet IDs for use elsewhere
export { MASTER_DB_ID, APP_DB_ID, KRA_SOP_DB_ID };
