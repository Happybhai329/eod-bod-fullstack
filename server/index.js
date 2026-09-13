import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase, query, run, get } from './db.js';
import {
  syncDailyReportToSheets,
  syncFineToSheets,
  syncUserConfigToSheets,
  syncDepartmentToSheets,
  fetchAssignedTasks,
  updateAssignedChecklist,
  updateAssignedSubTask,
  submitAssignedTask
} from './googleSheets.js';
import { startAutoSync, runTwoWaySync, getSyncStatus } from './syncEngine.js';
import {
  calculatePerformance,
  calculateFinalScore,
  clampNumber,
  parseScoreHelper,
  getSafeNonNegativeNumber,
  MIN_HEAD_RATING,
  MAX_HEAD_RATING,
  DEFAULT_HEAD_RATING
} from './scoringEngine.js';

const APPROVAL_STATUS_PENDING = 'Pending Review';
const APPROVAL_STATUS_APPROVED = 'Approved';
const APPROVAL_STATUS_AUTO_APPROVED = 'Auto Approved';
const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const BOD_EDIT_WINDOW_MS = 10 * 60 * 60 * 1000;
const EOD_EDIT_WINDOW_MS = 4 * 60 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Safe non-blocking sync helpers
function asyncSyncReport(report) {
  if (!report) return;
  syncDailyReportToSheets(report).catch(err => {
    console.warn('[Sync Outbox] Report sync notice (ignored):', err.message);
  });
}

function asyncSyncFine(fine) {
  if (!fine) return;
  syncFineToSheets(fine).catch(err => {
    console.warn('[Sync Outbox] Fine sync notice (ignored):', err.message);
  });
}

// Utility functions
function getTodayString() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseDateDDMMYYYY(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date(0);
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date(dateStr);
  return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
}

function toComparableDate(ddmmyyyyStr) {
  if (!ddmmyyyyStr || typeof ddmmyyyyStr !== 'string') return '';
  const p = ddmmyyyyStr.split('/');
  if (p.length !== 3) return '';
  return p[2] + p[1] + p[0];
}

function isDateInFilter(dateStr, filter) {
  if (!filter || filter === 'All') return true;
  const todayStr = getTodayString();
  if (filter === 'Daily') {
    return dateStr === todayStr;
  }
  const reportDate = parseDateDDMMYYYY(dateStr);
  if (isNaN(reportDate.getTime()) || reportDate.getTime() === 0) return true;

  const now = new Date();
  const reportTime = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate()).getTime();
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((todayTime - reportTime) / (1000 * 60 * 60 * 24));

  if (filter === 'Weekly') {
    return diffDays >= 0 && diffDays <= 7;
  }
  if (filter === 'Monthly') {
    return diffDays >= 0 && diffDays <= 30;
  }
  return true;
}

// Automatic review auto-approval check
async function checkAutoApprovals() {
  try {
    const now = new Date().getTime();
    const reports = await query(`SELECT * FROM daily_reports WHERE approval_status = 'Pending Review' AND eod_data IS NOT NULL AND eod_data != ''`);
    for (const r of reports) {
      let expiryTime = r.expiry_timestamp ? new Date(r.expiry_timestamp).getTime() : null;
      if (!expiryTime && r.last_updated) {
        expiryTime = new Date(r.last_updated).getTime() + REVIEW_WINDOW_MS;
      }
      if (expiryTime && now > expiryTime) {
        const sysScore = parseScoreHelper(r.system_score, 100);
        const finalScore = calculateFinalScore(sysScore, DEFAULT_HEAD_RATING);
        const expiryDateStr = new Date(expiryTime).toISOString();

        await run(
          `UPDATE daily_reports SET head_rating = ?, final_score = ?, approval_status = 'Auto Approved', approval_timestamp = ?, rated_by = 'System (Auto Approval)', rated_on = ?, last_updated = ? WHERE id = ?`,
          [DEFAULT_HEAD_RATING, finalScore, expiryDateStr, expiryDateStr, new Date().toISOString(), r.id]
        );

        const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
        await run(
          `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
          [notifId, r.employee_id, 'Auto Approved', `Your report for ${r.date} was auto-approved with a head rating of 100%.`, new Date().toISOString()]
        );

        const updated = await get(`SELECT * FROM daily_reports WHERE id = ?`, [r.id]);
        if (updated) asyncSyncReport(updated);
      }
    }
  } catch (err) {
    console.error('Auto approval error:', err);
  }
}

// -------------------------------------------------------------
// HEALTH CHECK ROUTE (Render & Cloud Monitoring)
// -------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const empCount = await query(`SELECT COUNT(*) as count FROM employees`);
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'connected',
      employees: empCount[0]?.count || 0
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { empId, role } = req.body;
    if (!empId) return res.status(400).json({ success: false, message: 'Employee ID is required.' });

    const trimmedId = empId.trim();
    const emp = await get(
      `SELECT * FROM employees WHERE id = ? OR emp_id = ?`,
      [trimmedId, trimmedId]
    );
    if (!emp) return res.status(404).json({ success: false, message: 'Employee ID not found in system.' });
    if (emp.status && emp.status.toLowerCase() !== 'active') return res.status(403).json({ success: false, message: 'Access Denied: Account status is not Active.' });

    const effectiveId = emp.emp_id || emp.id;
    const managedDepts = await query(
      `SELECT * FROM departments WHERE head_id = ? OR head_id = ?`,
      [emp.id, effectiveId]
    );
    const isHead = (managedDepts && managedDepts.length > 0) ||
      (emp.role && emp.role.toLowerCase().includes('head')) ||
      (emp.role && emp.role.toLowerCase().includes('admin')) ||
      (emp.role && emp.role.toLowerCase().includes('manager'));

    if (role === 'Head' && !isHead) {
      return res.status(403).json({ success: false, message: 'Access Denied: You do not have Head/Admin privileges.' });
    }

    res.json({
      success: true,
      user: {
        id: effectiveId,
        name: emp.name,
        department: emp.department,
        subDepartment: emp.sub_department || '',
        designation: emp.designation || emp.role || '',
        role: emp.role,
        isHead: isHead
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// HIERARCHY & STRUCTURE ROUTES
// -------------------------------------------------------------
app.get('/api/hierarchy', async (req, res) => {
  try {
    const departments = await query(`SELECT * FROM departments`);
    const employees = await query(`SELECT * FROM employees WHERE LOWER(status) = 'active'`);
    res.json({ success: true, departments, employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/structure/assign', async (req, res) => {
  try {
    const { subDeptName, headId, requesterId } = req.body;
    if (!subDeptName || !headId) return res.status(400).json({ success: false, message: 'Sub-department name and head ID required.' });
    
    if (requesterId) {
      const requester = await get(`SELECT * FROM employees WHERE id = ? OR emp_id = ?`, [requesterId, requesterId]);
      const isAdmin = requester && (requester.role.toLowerCase().includes('admin') || requester.role.toLowerCase().includes('director'));
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Only System Administrators can reassign department heads.' });
      }
    }

    const emp = await get(`SELECT * FROM employees WHERE id = ? OR emp_id = ?`, [headId, headId]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const effectiveId = emp.emp_id || emp.id;
    await run(`UPDATE departments SET head_id = ?, head_name = ? WHERE name = ?`, [effectiveId, `${emp.name} (${effectiveId})`, subDeptName]);
    // Push department head change to Google Sheets (fire-and-forget)
    syncDepartmentToSheets({ name: subDeptName, head_id: effectiveId, head_name: `${emp.name} (${effectiveId})` }).catch(err => {
      console.warn('[Sync Outbox] Department sync notice (ignored):', err.message);
    });
    res.json({ success: true, message: `Assigned ${emp.name} as head of ${subDeptName}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/structure/remove', async (req, res) => {
  try {
    const { subDeptName, requesterId } = req.body;
    if (requesterId) {
      const requester = await get(`SELECT * FROM employees WHERE id = ? OR emp_id = ?`, [requesterId, requesterId]);
      const isAdmin = requester && (requester.role.toLowerCase().includes('admin') || requester.role.toLowerCase().includes('director'));
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Only System Administrators can remove department heads.' });
      }
    }

    await run(`UPDATE departments SET head_id = NULL, head_name = NULL WHERE name = ?`, [subDeptName]);
    // Push department head removal to Google Sheets (fire-and-forget)
    syncDepartmentToSheets({ name: subDeptName, head_id: '', head_name: '' }).catch(err => {
      console.warn('[Sync Outbox] Department sync notice (ignored):', err.message);
    });
    res.json({ success: true, message: `Removed head from ${subDeptName}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// EMPLOYEE FORM & REPORT ROUTES
// -------------------------------------------------------------
app.get('/api/employee/:id/form', async (req, res) => {
  try {
    const empId = req.params.id;
    const emp = await get(`SELECT * FROM employees WHERE (id = ? OR emp_id = ?) AND LOWER(status) = 'active'`, [empId, empId]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found or inactive.' });

    let userConfig = await get(`SELECT * FROM user_configs WHERE employee_id = ? OR employee_id = ?`, [emp.id, emp.emp_id || emp.id]);
    let configObj = [];
    if (userConfig && userConfig.config_json) {
      try { configObj = JSON.parse(userConfig.config_json); } catch (e) {}
    }

    const todayStr = getTodayString();
    const todayReport = await get(`SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`, [todayStr, empId]);

    let todayStatus = {
      bodFilled: false,
      eodFilled: false,
      bodEditable: false,
      eodEditable: false,
      bodRemainingMs: 0,
      eodRemainingMs: 0
    };

    let bodDataObj = null;
    let eodDataObj = null;

    if (todayReport) {
      if (todayReport.bod_data) {
        todayStatus.bodFilled = true;
        if (typeof todayReport.bod_data === 'object') {
          bodDataObj = todayReport.bod_data;
        } else {
          try { bodDataObj = JSON.parse(todayReport.bod_data); } catch (e) {}
        }
      }
      if (todayReport.eod_data) {
        todayStatus.eodFilled = true;
        if (typeof todayReport.eod_data === 'object') {
          eodDataObj = todayReport.eod_data;
        } else {
          try { eodDataObj = JSON.parse(todayReport.eod_data); } catch (e) {}
        }
      }

      if (todayReport.last_updated && todayReport.approval_status !== 'Approved' && todayReport.approval_status !== 'Auto Approved') {
        const lastEditTime = new Date(todayReport.last_updated).getTime();
        const now = new Date().getTime();
        if (todayStatus.eodFilled) {
          const remaining = lastEditTime + EOD_EDIT_WINDOW_MS - now;
          if (remaining > 0) {
            todayStatus.bodEditable = true;
            todayStatus.eodEditable = true;
            todayStatus.bodRemainingMs = remaining;
            todayStatus.eodRemainingMs = remaining;
          }
        } else if (todayStatus.bodFilled) {
          const remaining = lastEditTime + BOD_EDIT_WINDOW_MS - now;
          if (remaining > 0) {
            todayStatus.bodEditable = true;
            todayStatus.bodRemainingMs = remaining;
          }
        }
      }
    } else {
      todayStatus.bodEditable = true;
      todayStatus.eodEditable = true;
    }

    res.json({
      success: true,
      date: todayStr,
      config: configObj,
      todayStatus,
      bodData: bodDataObj,
      eodData: eodDataObj
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/employee/:id/report', async (req, res) => {
  try {
    const empId = req.params.id;
    const { phase, phaseData } = req.body;
    if (!['BOD', 'EOD'].includes(phase)) return res.status(400).json({ success: false, message: 'Invalid report phase.' });

    const emp = await get(`SELECT * FROM employees WHERE (id = ? OR emp_id = ?) AND LOWER(status) = 'active'`, [empId, empId]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const effectiveId = emp.emp_id || emp.id;
    const todayStr = getTodayString();
    const now = new Date();
    const safePhaseJSON = JSON.stringify(phaseData);
    const existing = await get(`SELECT * FROM daily_reports WHERE date = ? AND (employee_id = ? OR employee_id = ?)`, [todayStr, emp.id, effectiveId]);

    let savedReport = null;
    if (!existing) {
      if (phase === 'BOD') {
        await run(
          `INSERT INTO daily_reports (date, employee_id, department, bod_data, last_updated) VALUES (?, ?, ?, ?, ?)`,
          [todayStr, effectiveId, emp.department, safePhaseJSON, now.toISOString()]
        );
      } else {
        const sysScore = calculatePerformance(null, phaseData);
        const finalScore = sysScore;
        const expiryTime = new Date(now.getTime() + REVIEW_WINDOW_MS).toISOString();
        await run(
          `INSERT INTO daily_reports (date, employee_id, department, eod_data, system_score, final_score, last_updated, approval_status, expiry_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Review', ?)`,
          [todayStr, effectiveId, emp.department, safePhaseJSON, sysScore, finalScore, now.toISOString(), expiryTime]
        );
      }
      savedReport = await get(
        `SELECT * FROM daily_reports WHERE date = ? AND (employee_id = ? OR employee_id = ?)`,
        [todayStr, emp.id, effectiveId]
      );
    } else {
      if (existing.approval_status === 'Approved' || existing.approval_status === 'Auto Approved') {
        return res.status(400).json({ success: false, message: `This report is locked. It is already ${existing.approval_status.toLowerCase()}.` });
      }

      if (phase === 'BOD') {
        await run(
          `UPDATE daily_reports SET bod_data = ?, last_updated = ? WHERE id = ?`,
          [safePhaseJSON, now.toISOString(), existing.id]
        );
        savedReport = await get(`SELECT * FROM daily_reports WHERE id = ?`, [existing.id]);
      } else {
        let bodObj = null;
        if (existing.bod_data) {
          if (typeof existing.bod_data === 'object') {
            bodObj = existing.bod_data;
          } else {
            try { bodObj = JSON.parse(existing.bod_data); } catch (e) {}
          }
        }
        const sysScore = calculatePerformance(bodObj, phaseData);
        let finalScore = sysScore;
        if (existing.head_rating !== null && existing.head_rating !== undefined && existing.head_rating !== '' && existing.head_rating !== 'Auto') {
          finalScore = calculateFinalScore(sysScore, existing.head_rating);
        }

        const expiryTime = new Date(now.getTime() + REVIEW_WINDOW_MS).toISOString();
        await run(
          `UPDATE daily_reports SET eod_data = ?, system_score = ?, final_score = ?, last_updated = ?, approval_status = 'Pending Review', expiry_timestamp = ? WHERE id = ?`,
          [safePhaseJSON, sysScore, finalScore, now.toISOString(), expiryTime, existing.id]
        );
        savedReport = await get(`SELECT * FROM daily_reports WHERE id = ?`, [existing.id]);
      }
    }

    if (savedReport) {
      asyncSyncReport(savedReport);
    }

    res.json({ success: true, message: `${phase} report saved successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// EMPLOYEE & HEAD DASHBOARD & HISTORY DATA
// -------------------------------------------------------------
app.get('/api/employee/:id/dashboard', async (req, res) => {
  try {
    await checkAutoApprovals();
    const empId = req.params.id;
    const { filter = 'Weekly' } = req.query;

    const allReports = await query(`SELECT * FROM daily_reports WHERE employee_id = ? ORDER BY id DESC`, [empId]);
    const fines = await query(`SELECT * FROM fines WHERE employee_id = ? ORDER BY id DESC`, [empId]);

    // Apply date range filter to scores & metrics
    const filteredReports = allReports.filter(r => isDateInFilter(r.date, filter));

    const scores = filteredReports
      .filter(r => (r.approval_status === 'Approved' || r.approval_status === 'Auto Approved') && r.final_score !== null)
      .map(r => r.final_score);

    const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Security: Sanitize Head ID from employee-facing payloads so employees never see manager IDs
    const sanitizeForEmployee = (text) => {
      if (!text) return text;
      const clean = String(text).replace(/\s*\([^)]*\)/g, '').trim();
      if (!clean || (/^[A-Z0-9_-]+$/i.test(clean) && !clean.includes(' '))) {
        return 'Department Head';
      }
      return clean;
    };

    const sanitizedReports = allReports.map(r => ({
      ...r,
      rating_edited_by: sanitizeForEmployee(r.rating_edited_by),
      rated_by: sanitizeForEmployee(r.rated_by),
      fine_issued_by: sanitizeForEmployee(r.fine_issued_by)
    }));

    const sanitizedFilteredReports = filteredReports.map(r => ({
      ...r,
      rating_edited_by: sanitizeForEmployee(r.rating_edited_by),
      rated_by: sanitizeForEmployee(r.rated_by),
      fine_issued_by: sanitizeForEmployee(r.fine_issued_by)
    }));

    const sanitizedFines = fines.map(f => ({
      ...f,
      issued_by: sanitizeForEmployee(f.issued_by)
    }));

    res.json({
      success: true,
      data: {
        average,
        reports: sanitizedReports,
        filteredReports: sanitizedFilteredReports,
        fines: sanitizedFines
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/head/dashboard', async (req, res) => {
  try {
    await checkAutoApprovals();
    const { headId, filter = 'Weekly' } = req.query;
    if (!headId) return res.status(400).json({ success: false, message: 'Head ID is required.' });

    const trimmedHeadId = headId.trim();
    const headEmp = await get(
      `SELECT * FROM employees WHERE id = ? OR emp_id = ?`,
      [trimmedHeadId, trimmedHeadId]
    );

    const headCodes = [trimmedHeadId];
    if (headEmp) {
      if (headEmp.id) headCodes.push(headEmp.id);
      if (headEmp.emp_id) headCodes.push(headEmp.emp_id);
    }

    const depts = await query(`SELECT * FROM departments`);
    const allEmps = await query(`SELECT * FROM employees WHERE LOWER(status) = 'active'`);

    // Find all department names where head_id matches any of the head's identifiers
    let directHeadDeptNames = depts
      .filter(d => headCodes.includes(d.head_id))
      .map(d => d.name);

    // Fallback: If user isn't assigned as head_id in departments table, match by user's primary department
    if (directHeadDeptNames.length === 0 && headEmp && headEmp.department) {
      directHeadDeptNames.push(headEmp.department);
      if (headEmp.sub_department) directHeadDeptNames.push(headEmp.sub_department);
    }

    // Find all sub-departments under those main departments
    let childSubDeptNames = depts
      .filter(d => directHeadDeptNames.some(p => p && d.parent && p.toLowerCase().trim() === d.parent.toLowerCase().trim()))
      .map(d => d.name);

    let allManagedDeptNames = [...new Set([...directHeadDeptNames, ...childSubDeptNames])];

    const managedEmps = allEmps.filter(e =>
      allManagedDeptNames.some(dName =>
        (e.department && e.department.toLowerCase().trim() === dName.toLowerCase().trim()) ||
        (e.sub_department && e.sub_department.toLowerCase().trim() === dName.toLowerCase().trim()) ||
        (e.other_department && e.other_department.toLowerCase().includes(dName.toLowerCase().trim()))
      ) || headCodes.includes(e.id) || headCodes.includes(e.emp_id)
    );

    const managedEmpIds = new Set(
      managedEmps.flatMap(e => [e.id, e.emp_id].filter(Boolean))
    );

    let sql = `SELECT * FROM daily_reports WHERE eod_data IS NOT NULL AND eod_data != '' ORDER BY id DESC`;
    const allReports = await query(sql);
    const reports = allReports.filter(r => managedEmpIds.has(r.employee_id));

    // Filter reports according to selected time period (Daily, Weekly, Monthly)
    const filteredReports = reports.filter(r => isDateInFilter(r.date, filter));

    // Calculate score metrics based on filtered date range
    const empScores = {};
    filteredReports.forEach(r => {
      if ((r.approval_status === 'Approved' || r.approval_status === 'Auto Approved') && r.final_score !== null) {
        if (!empScores[r.employee_id]) empScores[r.employee_id] = [];
        empScores[r.employee_id].push(r.final_score);
      }
    });

    let overallSum = 0;
    let overallCount = 0;
    let highest = -1;
    let lowest = 201;
    let topEmp = 'N/A';
    let lowEmp = 'N/A';

    for (const eId in empScores) {
      const arr = empScores[eId];
      const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      overallSum += avg;
      overallCount++;
      if (avg > highest) { highest = avg; topEmp = `${eId} (${avg}%)`; }
      if (avg < lowest) { lowest = avg; lowEmp = `${eId} (${avg}%)`; }
    }

    const overallAverage = overallCount > 0 ? Math.round(overallSum / overallCount) : 0;

    res.json({
      success: true,
      data: {
        overallAverage,
        topPerformer: topEmp,
        needsAttention: lowEmp,
        reports,
        filteredReports,
        managedEmployees: managedEmps.map(e => ({ ...e, id: e.emp_id || e.id }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// RATING & REVIEW ROUTE
// -------------------------------------------------------------
app.post('/api/head/rate', async (req, res) => {
  try {
    const { empId, dateStr, rating, attendance = 'Present', overtime = 0, headId } = req.body;
    if (!empId || !dateStr) return res.status(400).json({ success: false, message: 'Employee ID and Date required.' });

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < MIN_HEAD_RATING || numRating > MAX_HEAD_RATING) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 0 and 200.' });
    }

    const report = await get(`SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`, [dateStr, empId]);
    if (!report) return res.status(404).json({ success: false, message: 'Report record not found.' });
    if (!report.eod_data) return res.status(400).json({ success: false, message: 'An EOD report must be submitted before rating.' });

    if (report.approval_status === 'Approved' || report.approval_status === 'Auto Approved') {
      return res.status(400).json({ success: false, message: `Report is already ${report.approval_status.toLowerCase()} and locked.` });
    }

    const headUser = await get(`SELECT name FROM employees WHERE id = ? OR emp_id = ?`, [headId, headId]);
    const raterName = headUser ? `${headUser.name} (${headId})` : `Head ${headId}`;
    const sysScore = parseScoreHelper(report.system_score, 100);
    const finalScore = calculateFinalScore(sysScore, numRating);
    const nowIso = new Date().toISOString();

    await run(
      `UPDATE daily_reports SET head_rating = ?, final_score = ?, attendance = ?, overtime = ?, rating_last_updated = ?, rating_edited_by = ?, approval_status = 'Approved', approval_timestamp = ?, rated_by = ?, rated_on = ?, last_updated = ? WHERE id = ?`,
      [numRating, finalScore, attendance, overtime, nowIso, raterName, nowIso, raterName, nowIso, nowIso, report.id]
    );

    const reviewerDisplayName = headUser ? headUser.name : 'Department Head';
    const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    await run(
      `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
      [notifId, empId, 'Report Approved', `Your report for ${dateStr} was approved by ${reviewerDisplayName} with a rating of ${numRating}% (Final Score: ${finalScore}%).`, nowIso]
    );

    const updated = await get(`SELECT * FROM daily_reports WHERE id = ?`, [report.id]);
    if (updated) asyncSyncReport(updated);

    res.json({ success: true, finalScore, headRating: numRating, message: 'Rating saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// ASSIGNED TASKS (1:1 with Reference GS App)
// -------------------------------------------------------------
app.get('/api/assigned-tasks/:empId', async (req, res) => {
  try {
    const empId = req.params.empId;
    const result = await fetchAssignedTasks(empId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: { active: [], completed: [], taskScore: 0 } });
  }
});

app.post('/api/assigned-tasks/checklist', async (req, res) => {
  try {
    const { itemId, done, by } = req.body;
    if (!itemId) return res.status(400).json({ success: false, message: 'Item ID required.' });
    const result = await updateAssignedChecklist({ itemId, done, by });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/assigned-tasks/subtask', async (req, res) => {
  try {
    const { subTaskId, done, by } = req.body;
    if (!subTaskId) return res.status(400).json({ success: false, message: 'SubTask ID required.' });
    const result = await updateAssignedSubTask({ subTaskId, done, by });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/assigned-tasks/submit', async (req, res) => {
  try {
    const { taskId, by } = req.body;
    if (!taskId) return res.status(400).json({ success: false, message: 'Task ID required.' });
    const result = await submitAssignedTask({ taskId, by });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// USER CONFIG MANAGEMENT
// -------------------------------------------------------------
app.get('/api/config/:id', async (req, res) => {
  try {
    const empId = req.params.id;
    const configRow = await get(`SELECT * FROM user_configs WHERE employee_id = ?`, [empId]);
    const config = configRow ? JSON.parse(configRow.config_json) : [];
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/config/:id', async (req, res) => {
  try {
    const empId = req.params.id;
    const { configJson } = req.body;
    const nowIso = new Date().toISOString();
    await run(
      `INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`,
      [empId, JSON.stringify(configJson), nowIso]
    );
    // Push config change to Google Sheets (fire-and-forget)
    syncUserConfigToSheets({ employee_id: empId, config_json: JSON.stringify(configJson), last_updated: nowIso }).catch(err => {
      console.warn('[Sync Outbox] Config sync notice (ignored):', err.message);
    });
    res.json({ success: true, message: 'Tasks configuration saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// FINE MANAGEMENT ROUTES
// -------------------------------------------------------------
app.get('/api/fines', async (req, res) => {
  try {
    const { empId, headId } = req.query;
    let fines = [];
    if (empId) {
      fines = await query(`SELECT * FROM fines WHERE employee_id = ? ORDER BY id DESC`, [empId]);
    } else if (headId) {
      fines = await query(`SELECT * FROM fines ORDER BY id DESC`);
    } else {
      fines = await query(`SELECT * FROM fines ORDER BY id DESC`);
    }
    res.json({ success: true, fines });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fines/issue', async (req, res) => {
  try {
    const { empId, dateStr, amount, reason, headId } = req.body;
    if (!empId || !dateStr || !amount || !reason) {
      return res.status(400).json({ success: false, message: 'Employee ID, Date, Amount, and Reason are required.' });
    }

    const headUser = await get(`SELECT name FROM employees WHERE id = ? OR emp_id = ?`, [headId, headId]);
    const issuerName = headUser ? `${headUser.name} (${headId})` : `Head ${headId}`;
    const fineId = 'F' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    const nowIso = new Date().toISOString();
    const docName = `Fine_Notice_${empId}_${dateStr.replace(/\//g, '')}.pdf`;
    const docUrl = `/api/fines/${fineId}/document`;

    const fineObj = {
      id: fineId,
      employee_id: empId,
      date: dateStr,
      amount: Number(amount),
      reason,
      doc_url: docUrl,
      doc_name: docName,
      issued_on: nowIso,
      issued_by: issuerName,
      status: 'Pending',
      last_updated: nowIso
    };

    await run(
      `INSERT INTO fines (id, employee_id, date, amount, reason, doc_url, doc_name, issued_on, issued_by, status, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [fineId, empId, dateStr, amount, reason, docUrl, docName, nowIso, issuerName, nowIso]
    );

    await run(
      `UPDATE daily_reports SET fine_amount = ?, fine_reason = ?, fine_doc_url = ?, fine_doc_name = ?, fine_issued_on = ?, fine_issued_by = ?, fine_status = 'Pending', last_updated = ? WHERE date = ? AND employee_id = ?`,
      [amount, reason, docUrl, docName, nowIso, issuerName, nowIso, dateStr, empId]
    );

    const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    await run(
      `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
      [notifId, empId, 'New Fine Issued', `A fine of ₹${amount} was issued for ${dateStr}. Reason: ${reason}`, nowIso]
    );

    asyncSyncFine(fineObj);
    const updatedDailyReport = await get(`SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`, [dateStr, empId]);
    if (updatedDailyReport) asyncSyncReport(updatedDailyReport);

    res.json({ success: true, fineId, docUrl, message: 'Fine issued successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fines/status', async (req, res) => {
  try {
    const { fineId, status, employeeRemarks } = req.body;
    const nowIso = new Date().toISOString();
    const fine = await get(`SELECT * FROM fines WHERE id = ?`, [fineId]);
    if (!fine) return res.status(404).json({ success: false, message: 'Fine record not found.' });

    await run(
      `UPDATE fines SET status = ?, employee_remarks = ?, last_updated = ? WHERE id = ?`,
      [status, employeeRemarks || '', nowIso, fineId]
    );

    await run(
      `UPDATE daily_reports SET fine_status = ?, employee_remarks = ?, last_updated = ? WHERE date = ? AND employee_id = ?`,
      [status, employeeRemarks || '', nowIso, fine.date, fine.employee_id]
    );

    // Notify issuing authority if disputed or acknowledged
    const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    await run(
      `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
      [notifId, fine.employee_id, `Fine ${status}`, `Fine #${fineId} status updated to '${status}'. Remarks: ${employeeRemarks || 'None'}`, nowIso]
    );

    const updatedFine = await get(`SELECT * FROM fines WHERE id = ?`, [fineId]);
    if (updatedFine) asyncSyncFine(updatedFine);

    const updatedDailyReport = await get(`SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`, [fine.date, fine.employee_id]);
    if (updatedDailyReport) asyncSyncReport(updatedDailyReport);

    res.json({ success: true, message: 'Fine status updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// FINE PRINTABLE DOCUMENT VIEW
// -------------------------------------------------------------
app.get('/api/fines/:id/document', async (req, res) => {
  try {
    const fineId = req.params.id;
    const fine = await get(`SELECT * FROM fines WHERE id = ?`, [fineId]);
    if (!fine) return res.status(404).send('<h2>Fine notice not found.</h2>');

    const emp = await get(`SELECT * FROM employees WHERE id = ? OR emp_id = ?`, [fine.employee_id, fine.employee_id]);
    const empName = emp ? emp.name : fine.employee_id;
    const dept = emp ? emp.department : 'Operations';
    const desig = emp ? emp.designation : 'Staff';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Official Fine Notice - ${fine.id}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px auto; max-width: 800px; color: #1e293b; line-height: 1.6; }
    .letterhead { border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 24px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px; }
    .title-banner { background: #fef2f2; border: 1px solid #fca5a5; padding: 12px 18px; border-radius: 8px; margin-bottom: 24px; }
    .title-banner h2 { color: #dc2626; margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .meta-table td { padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 14px; }
    .meta-table .label { font-weight: 700; background: #f8fafc; width: 25%; color: #475569; }
    .fine-amount { font-size: 26px; font-weight: 800; color: #dc2626; margin: 16px 0; }
    .reason-box { background: #f8fafc; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; font-size: 14px; margin-bottom: 24px; }
    .remarks-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; font-size: 14px; margin-bottom: 24px; }
    .signatures { margin-top: 50px; display: flex; justify-content: space-between; padding-top: 30px; }
    .sig-block { border-top: 1px solid #94a3b8; width: 220px; text-align: center; font-size: 13px; color: #64748b; padding-top: 6px; }
    .actions { margin-bottom: 20px; text-align: right; }
    .btn { background: #1e3a8a; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; text-decoration: none; font-size: 13px; }
    @media print { .actions { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="letterhead">
    <div>
      <div class="brand">DAILY OPERATIONS HUB</div>
      <small style="color: #64748b; font-weight: 600; text-transform: uppercase;">Workforce Performance & Operations Division</small>
    </div>
    <div style="text-align: right; font-size: 12px; color: #64748b;">
      <strong>Ref Doc:</strong> ${fine.id}<br>
      <strong>Issued On:</strong> ${new Date(fine.issued_on).toLocaleDateString('en-GB')}
    </div>
  </div>

  <div class="title-banner">
    <h2>Notice of Operational Fine / Penalty</h2>
  </div>

  <table class="meta-table">
    <tr>
      <td class="label">Employee Name</td>
      <td><strong>${empName}</strong></td>
      <td class="label">Employee ID</td>
      <td><strong>${fine.employee_id}</strong></td>
    </tr>
    <tr>
      <td class="label">Department</td>
      <td>${dept}</td>
      <td class="label">Designation</td>
      <td>${desig}</td>
    </tr>
    <tr>
      <td class="label">Task Date</td>
      <td><strong>${fine.date}</strong></td>
      <td class="label">Fine Status</td>
      <td><strong>${fine.status || 'Pending'}</strong></td>
    </tr>
    <tr>
      <td class="label">Issuing Authority</td>
      <td colspan="3">${fine.issued_by}</td>
    </tr>
  </table>

  <div>
    <strong>Fine Deduction Amount:</strong>
    <div class="fine-amount">₹${fine.amount}</div>
  </div>

  <div>
    <strong>Reason for Penalty / Policy Infraction:</strong>
    <div class="reason-box">
      ${fine.reason}
    </div>
  </div>

  ${fine.employee_remarks ? `
  <div>
    <strong>Employee Remarks / Explanation:</strong>
    <div class="remarks-box">
      ${fine.employee_remarks}
    </div>
  </div>
  ` : ''}

  <div class="signatures">
    <div class="sig-block">
      <strong>${fine.issued_by}</strong><br>
      Authorized Signatory / Department Head
    </div>
    <div class="sig-block">
      <strong>${empName}</strong><br>
      Employee Signature & Acknowledgment
    </div>
  </div>
</body>
</html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send('Error generating fine notice: ' + err.message);
  }
});

// -------------------------------------------------------------
// NOTIFICATION ROUTES
// -------------------------------------------------------------
app.get('/api/notifications/:id', async (req, res) => {
  try {
    const empId = req.params.id;
    const notifications = await query(`SELECT * FROM notifications WHERE employee_id = ? ORDER BY id DESC`, [empId]);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    const empId = req.params.id;
    await run(`UPDATE notifications SET read = 1 WHERE employee_id = ?`, [empId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// KRA & SOP ROUTES
// -------------------------------------------------------------
app.get('/api/kras', async (req, res) => {
  try {
    const { search } = req.query;
    let kras;
    if (search) {
      const term = `%${search.trim().toLowerCase()}%`;
      kras = await query(`SELECT * FROM kras WHERE LOWER(id) LIKE ? OR LOWER(position_name) LIKE ? OR LOWER(text) LIKE ? OR LOWER(type) LIKE ?`, [term, term, term, term]);
    } else {
      kras = await query(`SELECT * FROM kras`);
    }
    res.json({ success: true, kras });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/sops/:kraId', async (req, res) => {
  try {
    const kraId = req.params.kraId;
    const sops = await query(`SELECT * FROM sops WHERE kra_id = ?`, [kraId]);
    res.json({ success: true, sops });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// TWO-WAY SYNCHRONIZATION ROUTES
// -------------------------------------------------------------
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/sync/trigger', async (req, res) => {
  try {
    const result = await runTwoWaySync('MANUAL');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Static assets serving & SPA fallback
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Backend API running. Run "npm run build" to serve the frontend.');
  });
}

// Start Server if directly executed
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  initDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`EOD/BOD Full Stack Server running at http://localhost:${PORT}`);
      startAutoSync(15 * 60 * 1000);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
}

export { app, checkAutoApprovals, isDateInFilter, getTodayString, parseDateDDMMYYYY };


