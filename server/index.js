import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase, query, run, get } from './db.js';
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
          `UPDATE daily_reports SET head_rating = ?, final_score = ?, approval_status = 'Auto Approved', approval_timestamp = ?, rated_by = 'System (Auto Approval)', rated_on = ? WHERE id = ?`,
          [DEFAULT_HEAD_RATING, finalScore, expiryDateStr, expiryDateStr, r.id]
        );

        const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
        await run(
          `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
          [notifId, r.employee_id, 'Auto Approved', `Your report for ${r.date} was auto-approved with a head rating of 100%.`, new Date().toISOString()]
        );
      }
    }
  } catch (err) {
    console.error('Auto approval error:', err);
  }
}

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { empId, role } = req.body;
    if (!empId) return res.status(400).json({ success: false, message: 'Employee ID is required.' });

    const emp = await get(`SELECT * FROM employees WHERE id = ?`, [empId.trim()]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee ID not found in system.' });
    if (emp.status.toLowerCase() !== 'active') return res.status(403).json({ success: false, message: 'Access Denied: Account status is not Active.' });

    const managedDepts = await query(`SELECT * FROM departments WHERE head_id = ?`, [emp.id]);
    const isHead = (managedDepts && managedDepts.length > 0) ||
      emp.role.toLowerCase().includes('head') ||
      emp.role.toLowerCase().includes('admin') ||
      emp.role.toLowerCase().includes('manager');

    if (role === 'Head' && !isHead) {
      return res.status(403).json({ success: false, message: 'Access Denied: You do not have Head/Admin privileges.' });
    }

    res.json({
      success: true,
      user: {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        subDepartment: emp.sub_department || '',
        designation: emp.designation,
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
    const employees = await query(`SELECT * FROM employees WHERE status = 'Active'`);
    res.json({ success: true, departments, employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/structure/assign', async (req, res) => {
  try {
    const { subDeptName, headId } = req.body;
    if (!subDeptName || !headId) return res.status(400).json({ success: false, message: 'Sub-department name and head ID required.' });
    const emp = await get(`SELECT * FROM employees WHERE id = ?`, [headId]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    await run(`UPDATE departments SET head_id = ?, head_name = ? WHERE name = ?`, [emp.id, `${emp.name} (${emp.id})`, subDeptName]);
    res.json({ success: true, message: `Assigned ${emp.name} as head of ${subDeptName}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/structure/remove', async (req, res) => {
  try {
    const { subDeptName } = req.body;
    await run(`UPDATE departments SET head_id = NULL, head_name = NULL WHERE name = ?`, [subDeptName]);
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
    const emp = await get(`SELECT * FROM employees WHERE id = ? AND status = 'Active'`, [empId]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found or inactive.' });

    let userConfig = await get(`SELECT * FROM user_configs WHERE employee_id = ?`, [empId]);
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
        try { bodDataObj = JSON.parse(todayReport.bod_data); } catch (e) {}
      }
      if (todayReport.eod_data) {
        todayStatus.eodFilled = true;
        try { eodDataObj = JSON.parse(todayReport.eod_data); } catch (e) {}
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

    const emp = await get(`SELECT * FROM employees WHERE id = ? AND status = 'Active'`, [empId]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const todayStr = getTodayString();
    const now = new Date();
    const safePhaseJSON = JSON.stringify(phaseData);
    const existing = await get(`SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`, [todayStr, empId]);

    if (!existing) {
      if (phase === 'BOD') {
        await run(
          `INSERT INTO daily_reports (date, employee_id, department, bod_data, last_updated) VALUES (?, ?, ?, ?, ?)`,
          [todayStr, empId, emp.department, safePhaseJSON, now.toISOString()]
        );
      } else {
        const sysScore = calculatePerformance(null, phaseData);
        const expiryTime = new Date(now.getTime() + REVIEW_WINDOW_MS).toISOString();
        await run(
          `INSERT INTO daily_reports (date, employee_id, department, eod_data, system_score, last_updated, approval_status, expiry_timestamp) VALUES (?, ?, ?, ?, ?, ?, 'Pending Review', ?)`,
          [todayStr, empId, emp.department, safePhaseJSON, sysScore, now.toISOString(), expiryTime]
        );
      }
    } else {
      if (existing.approval_status === 'Approved' || existing.approval_status === 'Auto Approved') {
        return res.status(400).json({ success: false, message: `This report is locked. It is already ${existing.approval_status.toLowerCase()}.` });
      }

      if (phase === 'BOD') {
        await run(
          `UPDATE daily_reports SET bod_data = ?, last_updated = ? WHERE id = ?`,
          [safePhaseJSON, now.toISOString(), existing.id]
        );
      } else {
        let bodObj = null;
        if (existing.bod_data) {
          try { bodObj = JSON.parse(existing.bod_data); } catch (e) {}
        }
        const sysScore = calculatePerformance(bodObj, phaseData);
        let finalScore = existing.final_score;
        if (existing.head_rating !== null && existing.head_rating !== undefined) {
          finalScore = calculateFinalScore(sysScore, existing.head_rating);
        }

        const expiryTime = new Date(now.getTime() + REVIEW_WINDOW_MS).toISOString();
        await run(
          `UPDATE daily_reports SET eod_data = ?, system_score = ?, final_score = ?, last_updated = ?, approval_status = 'Pending Review', expiry_timestamp = ? WHERE id = ?`,
          [safePhaseJSON, sysScore, finalScore, now.toISOString(), expiryTime, existing.id]
        );
      }
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

    const reports = await query(`SELECT * FROM daily_reports WHERE employee_id = ? ORDER BY id DESC`, [empId]);
    const fines = await query(`SELECT * FROM fines WHERE employee_id = ? ORDER BY id DESC`, [empId]);

    const scores = reports
      .filter(r => (r.approval_status === 'Approved' || r.approval_status === 'Auto Approved') && r.final_score !== null)
      .map(r => r.final_score);

    const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    res.json({
      success: true,
      data: {
        average,
        reports,
        fines
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

    const depts = await query(`SELECT * FROM departments`);
    const allEmps = await query(`SELECT * FROM employees WHERE status = 'Active'`);

    // Find all department names where head_id = headId
    let directHeadDeptNames = depts.filter(d => d.head_id === headId).map(d => d.name);

    // Find all sub-departments under those main departments
    let childSubDeptNames = depts.filter(d => directHeadDeptNames.includes(d.parent)).map(d => d.name);
    let allManagedDeptNames = [...new Set([...directHeadDeptNames, ...childSubDeptNames])];

    // Fallback: If user isn't assigned as head_id in departments table, match by user's primary department
    const userEmp = allEmps.find(e => e.id === headId);
    if (allManagedDeptNames.length === 0 && userEmp) {
      allManagedDeptNames.push(userEmp.department);
      if (userEmp.sub_department) allManagedDeptNames.push(userEmp.sub_department);
    }

    const managedEmps = allEmps.filter(e =>
      allManagedDeptNames.some(dName =>
        (e.department && e.department.toLowerCase().trim() === dName.toLowerCase().trim()) ||
        (e.sub_department && e.sub_department.toLowerCase().trim() === dName.toLowerCase().trim()) ||
        (e.other_department && e.other_department.toLowerCase().includes(dName.toLowerCase().trim()))
      ) || e.id === headId
    );
    const managedEmpIds = managedEmps.map(e => e.id);

    let sql = `SELECT * FROM daily_reports WHERE eod_data IS NOT NULL AND eod_data != '' ORDER BY id DESC`;
    const allReports = await query(sql);
    const reports = allReports.filter(r => managedEmpIds.includes(r.employee_id));

    // Calculate score metrics
    const empScores = {};
    reports.forEach(r => {
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
        managedEmployees: managedEmps
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

    const headUser = await get(`SELECT name FROM employees WHERE id = ?`, [headId]);
    const raterName = headUser ? `${headUser.name} (${headId})` : `Head ${headId}`;
    const sysScore = parseScoreHelper(report.system_score, 100);
    const finalScore = calculateFinalScore(sysScore, numRating);
    const nowIso = new Date().toISOString();

    await run(
      `UPDATE daily_reports SET head_rating = ?, final_score = ?, attendance = ?, overtime = ?, rating_last_updated = ?, rating_edited_by = ?, approval_status = 'Approved', approval_timestamp = ?, rated_by = ?, rated_on = ? WHERE id = ?`,
      [numRating, finalScore, attendance, overtime, nowIso, raterName, nowIso, raterName, nowIso, report.id]
    );

    const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    await run(
      `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
      [notifId, empId, 'Report Approved', `Your report for ${dateStr} was approved by ${raterName} with a rating of ${numRating}% (Final Score: ${finalScore}%).`, nowIso]
    );

    res.json({ success: true, finalScore, headRating: numRating, message: 'Rating saved successfully.' });
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

    const headUser = await get(`SELECT name FROM employees WHERE id = ?`, [headId]);
    const issuerName = headUser ? `${headUser.name} (${headId})` : `Head ${headId}`;
    const fineId = 'F' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    const nowIso = new Date().toISOString();
    const docName = `Fine_Notice_${empId}_${dateStr.replace(/\//g, '')}.pdf`;
    const docUrl = `https://prime-docs.local/fines/${fineId}`;

    await run(
      `INSERT INTO fines (id, employee_id, date, amount, reason, doc_url, doc_name, issued_on, issued_by, status, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [fineId, empId, dateStr, amount, reason, docUrl, docName, nowIso, issuerName, nowIso]
    );

    await run(
      `UPDATE daily_reports SET fine_amount = ?, fine_reason = ?, fine_doc_url = ?, fine_doc_name = ?, fine_issued_on = ?, fine_issued_by = ?, fine_status = 'Pending' WHERE date = ? AND employee_id = ?`,
      [amount, reason, docUrl, docName, nowIso, issuerName, dateStr, empId]
    );

    const notifId = 'N' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    await run(
      `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
      [notifId, empId, 'New Fine Issued', `A fine of ₹${amount} was issued for ${dateStr}. Reason: ${reason}`, nowIso]
    );

    res.json({ success: true, fineId, message: 'Fine issued successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fines/status', async (req, res) => {
  try {
    const { fineId, status, employeeRemarks } = req.body;
    const nowIso = new Date().toISOString();
    await run(
      `UPDATE fines SET status = ?, employee_remarks = ?, last_updated = ? WHERE id = ?`,
      [status, employeeRemarks || '', nowIso, fineId]
    );
    res.json({ success: true, message: 'Fine status updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

// Start Server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`EOD/BOD Full Stack Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
