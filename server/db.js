import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath);

// Helper for promise-based queries
export function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export async function initDatabase() {
  await run(`PRAGMA foreign_keys = ON;`);

  await run(`
    CREATE TABLE IF NOT EXISTS departments (
      name TEXT PRIMARY KEY,
      parent TEXT,
      head_id TEXT,
      head_name TEXT,
      is_main INTEGER DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      sub_department TEXT,
      other_department TEXT,
      designation TEXT,
      role TEXT NOT NULL DEFAULT 'Employee',
      status TEXT NOT NULL DEFAULT 'Active'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_configs (
      employee_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      last_updated TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      department TEXT NOT NULL,
      bod_data TEXT,
      eod_data TEXT,
      system_score REAL,
      last_updated TEXT,
      head_rating REAL,
      final_score REAL,
      attendance TEXT DEFAULT 'Present',
      overtime REAL DEFAULT 0,
      rating_last_updated TEXT,
      rating_edited_by TEXT,
      approval_status TEXT DEFAULT 'Pending Review',
      approval_timestamp TEXT,
      expiry_timestamp TEXT,
      rated_by TEXT,
      rated_on TEXT,
      fine_amount REAL,
      fine_reason TEXT,
      fine_doc_url TEXT,
      fine_doc_name TEXT,
      fine_issued_on TEXT,
      fine_issued_by TEXT,
      fine_status TEXT,
      employee_remarks TEXT,
      UNIQUE(date, employee_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS fines (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      doc_url TEXT,
      doc_name TEXT,
      issued_on TEXT,
      issued_by TEXT,
      status TEXT DEFAULT 'Pending',
      employee_remarks TEXT,
      last_updated TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_on TEXT NOT NULL,
      read INTEGER DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS kras (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      position_name TEXT,
      text TEXT,
      type TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sops (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      position_name TEXT,
      kra_id TEXT,
      text TEXT,
      checklist TEXT,
      form_fields TEXT,
      doc_link TEXT
    )
  `);

  await seedInitialData();
}

async function seedInitialData() {
  const existingEmps = await query(`SELECT COUNT(*) as count FROM employees`);
  if (existingEmps[0].count > 0) {
    console.log('[DB] Database already populated — skipping seed.');
    return;
  }

  console.log('[DB] Database is empty — importing REAL data from Google Sheets...');

  try {
    const {
      initGoogleSheets,
      fetchRealDepartments,
      fetchRealEmployees,
      fetchRealUserConfigs,
      fetchRealDailyReports,
      fetchRealFines,
      fetchRealNotifications,
      fetchRealKRAs,
      fetchRealSOPs
    } = await import('./googleSheets.js');

    await initGoogleSheets();

    // 1. Import Departments
    const departments = await fetchRealDepartments();
    for (const d of departments) {
      await run(
        `INSERT OR REPLACE INTO departments (name, parent, head_id, head_name, is_main) VALUES (?, ?, ?, ?, ?)`,
        [d.name, d.parent, d.head_id, d.head_name, d.is_main]
      );
    }
    console.log(`[DB] ✅ Imported ${departments.length} departments`);

    // 2. Import Employees
    const employees = await fetchRealEmployees();
    for (const e of employees) {
      await run(
        `INSERT OR REPLACE INTO employees (id, name, department, sub_department, other_department, designation, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.name, e.department, e.sub_department, e.other_department, e.designation || '', e.role, e.status]
      );
    }
    console.log(`[DB] ✅ Imported ${employees.length} employees`);

    // 3. Import User Configs (task assignments)
    const configs = await fetchRealUserConfigs();
    for (const c of configs) {
      await run(
        `INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`,
        [c.employee_id, c.config_json, c.last_updated]
      );
    }
    console.log(`[DB] ✅ Imported ${configs.length} user task configurations`);

    // 4. Import Daily Reports
    const reports = await fetchRealDailyReports();
    for (const r of reports) {
      await run(
        `INSERT OR REPLACE INTO daily_reports (
          date, employee_id, department, bod_data, eod_data, system_score, last_updated,
          head_rating, final_score, attendance, overtime, rating_last_updated, rating_edited_by,
          approval_status, approval_timestamp, expiry_timestamp, rated_by, rated_on,
          fine_amount, fine_reason, fine_doc_url, fine_doc_name, fine_issued_on,
          fine_issued_by, fine_status, employee_remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.date, r.employee_id, r.department, r.bod_data, r.eod_data,
          r.system_score, r.last_updated, r.head_rating, r.final_score,
          r.attendance, r.overtime, r.rating_last_updated, r.rating_edited_by,
          r.approval_status, r.approval_timestamp, r.expiry_timestamp,
          r.rated_by, r.rated_on, r.fine_amount, r.fine_reason,
          r.fine_doc_url, r.fine_doc_name, r.fine_issued_on,
          r.fine_issued_by, r.fine_status, r.employee_remarks
        ]
      );
    }
    console.log(`[DB] ✅ Imported ${reports.length} daily reports`);

    // 5. Import Fines
    const fines = await fetchRealFines();
    for (const f of fines) {
      await run(
        `INSERT OR REPLACE INTO fines (id, employee_id, date, amount, reason, doc_url, doc_name, issued_on, issued_by, status, employee_remarks, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [f.id, f.employee_id, f.date, f.amount, f.reason, f.doc_url, f.doc_name, f.issued_on, f.issued_by, f.status, f.employee_remarks, f.last_updated]
      );
    }
    console.log(`[DB] ✅ Imported ${fines.length} fines`);

    // 6. Import Notifications
    const notifications = await fetchRealNotifications();
    for (const n of notifications) {
      await run(
        `INSERT OR REPLACE INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, ?)`,
        [n.id, n.employee_id, n.type, n.message, n.created_on, n.read]
      );
    }
    console.log(`[DB] ✅ Imported ${notifications.length} notifications`);

    // 7. Import KRAs
    const kras = await fetchRealKRAs();
    for (const k of kras) {
      await run(
        `INSERT OR REPLACE INTO kras (id, timestamp, position_name, text, type) VALUES (?, ?, ?, ?, ?)`,
        [k.id, k.timestamp, k.position_name, k.text, k.type]
      );
    }
    console.log(`[DB] ✅ Imported ${kras.length} KRAs`);

    // 8. Import SOPs
    const sops = await fetchRealSOPs();
    for (const s of sops) {
      await run(
        `INSERT OR REPLACE INTO sops (id, timestamp, position_name, kra_id, text, checklist, form_fields, doc_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.timestamp, s.position_name, s.kra_id, s.text, s.checklist, s.form_fields, s.doc_link]
      );
    }
    console.log(`[DB] ✅ Imported ${sops.length} SOPs`);

    console.log('====================================================');
    console.log('[DB] ✅ ALL REAL DATA IMPORTED FROM GOOGLE SHEETS');
    console.log('====================================================');

  } catch (error) {
    console.warn('[DB] ⚠️ Google Sheets import failed or credentials missing:', error.message);
    console.log('[DB] 🔄 Falling back to comprehensive local seed data...');
    await seedFallbackData();
  }
}

async function seedFallbackData() {
  const now = new Date();
  const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const nowIso = now.toISOString();

  // 1. Fallback Departments
  const departments = [
    { name: 'Sales & Marketing', parent: '', head_id: 'HEAD001', head_name: 'Rajesh Sharma (HEAD001)', is_main: 1 },
    { name: 'Direct Sales', parent: 'Sales & Marketing', head_id: 'SUBHEAD01', head_name: 'Amit Patel (SUBHEAD01)', is_main: 0 },
    { name: 'Digital Marketing', parent: 'Sales & Marketing', head_id: 'SUBHEAD02', head_name: 'Priya Verma (SUBHEAD02)', is_main: 0 },
    { name: 'Academic Operations', parent: '', head_id: 'HEAD002', head_name: 'Dr. Sunita Gupta (HEAD002)', is_main: 1 },
    { name: 'Faculty & Curriculum', parent: 'Academic Operations', head_id: 'SUBHEAD03', head_name: 'Vikram Singh (SUBHEAD03)', is_main: 0 },
    { name: 'Human Resources', parent: '', head_id: 'HEAD003', head_name: 'Neha Kapoor (HEAD003)', is_main: 1 },
    { name: 'Finance & Accounts', parent: '', head_id: 'HEAD004', head_name: 'Anil Agarwal (HEAD004)', is_main: 1 }
  ];
  for (const d of departments) {
    await run(
      `INSERT OR REPLACE INTO departments (name, parent, head_id, head_name, is_main) VALUES (?, ?, ?, ?, ?)`,
      [d.name, d.parent, d.head_id, d.head_name, d.is_main]
    );
  }

  // 2. Fallback Employees
  const employees = [
    { id: 'HEAD001', name: 'Rajesh Sharma', department: 'Sales & Marketing', sub_department: '', designation: 'VP of Sales', role: 'Head', status: 'Active' },
    { id: 'SUBHEAD01', name: 'Amit Patel', department: 'Sales & Marketing', sub_department: 'Direct Sales', designation: 'Sales Manager', role: 'Head', status: 'Active' },
    { id: 'SUBHEAD02', name: 'Priya Verma', department: 'Sales & Marketing', sub_department: 'Digital Marketing', designation: 'Marketing Lead', role: 'Head', status: 'Active' },
    { id: 'TPC25107MR', name: 'Happy Bhasin', department: 'Sales & Marketing', sub_department: 'Direct Sales', designation: 'Senior Sales Executive', role: 'Employee', status: 'Active' },
    { id: 'TPC25108AD', name: 'Aditi Sharma', department: 'Sales & Marketing', sub_department: 'Digital Marketing', designation: 'SEO Specialist', role: 'Employee', status: 'Active' },
    { id: 'HEAD002', name: 'Dr. Sunita Gupta', department: 'Academic Operations', sub_department: '', designation: 'Academic Director', role: 'Head', status: 'Active' },
    { id: 'SUBHEAD03', name: 'Vikram Singh', department: 'Academic Operations', sub_department: 'Faculty & Curriculum', designation: 'Faculty Lead', role: 'Head', status: 'Active' },
    { id: 'TPC25109HR', name: 'Harshraj Singh', department: 'Academic Operations', sub_department: 'Faculty & Curriculum', designation: 'Senior Faculty Member', role: 'Employee', status: 'Active' },
    { id: 'HEAD003', name: 'Neha Kapoor', department: 'Human Resources', sub_department: '', designation: 'Head of HR', role: 'Head', status: 'Active' },
    { id: 'TPC25110DV', name: 'Devash Verma', department: 'Human Resources', sub_department: '', designation: 'Recruiter', role: 'Employee', status: 'Active' },
    { id: 'HEAD004', name: 'Anil Agarwal', department: 'Finance & Accounts', sub_department: '', designation: 'Finance Chief', role: 'Head', status: 'Active' }
  ];
  for (const e of employees) {
    await run(
      `INSERT OR REPLACE INTO employees (id, name, department, sub_department, other_department, designation, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.name, e.department, e.sub_department, '', e.designation, e.role, e.status]
    );
  }

  // 3. Fallback User Task Configs
  const salesConfig = [
    { key: 'task_calls', label: 'Outbound Client Calls', type: 'number', target: 40, weight: 30, description: 'Outbound counseling calls.' },
    { key: 'task_demos', label: 'Conduct Demo Sessions', type: 'number', target: 5, weight: 35, description: 'Live student counseling demos.' },
    { key: 'task_followup', label: 'Follow up Open Inquiries', type: 'checkbox', weight: 15, description: 'CRM inquiry updates.' },
    { key: 'task_list', label: 'Daily Key Priorities', type: 'dynamicList', weight: 20, description: 'Key priority action items.' }
  ];
  const academicConfig = [
    { key: 'task_lectures', label: 'Deliver Scheduled Lectures', type: 'number', target: 4, weight: 40, description: 'Interactive classroom teaching.' },
    { key: 'task_evaluation', label: 'Evaluate Test Papers', type: 'number', target: 25, weight: 30, description: 'Grade student subjective papers.' },
    { key: 'task_doubt_session', label: 'Hold Student Doubt Clearing', type: 'checkbox', weight: 15, description: '1-on-1 student doubt clearing.' },
    { key: 'task_list', label: 'Curriculum & Paper Creation', type: 'dynamicList', weight: 15, description: 'Curriculum update deliverables.' }
  ];
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['TPC25107MR', JSON.stringify(salesConfig), nowIso]);
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['TPC25108AD', JSON.stringify(salesConfig), nowIso]);
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['TPC25109HR', JSON.stringify(academicConfig), nowIso]);
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['HEAD001', JSON.stringify(salesConfig), nowIso]);

  // 4. Fallback KRAs & SOPs
  const kras = [
    { id: 'KRA-SALES-01', timestamp: nowIso, position_name: 'Senior Sales Executive', text: 'Achieve monthly student enrollment targets and maintain high conversion rates.', type: 'Core Target' },
    { id: 'KRA-SALES-02', timestamp: nowIso, position_name: 'Senior Sales Executive', text: 'Maintain CRM records and follow up with leads within 2 hours of inquiry.', type: 'Operational' },
    { id: 'KRA-ACAD-01', timestamp: nowIso, position_name: 'Senior Faculty Member', text: 'Deliver high quality lectures aligned with curriculum syllabus schedule.', type: 'Academic' }
  ];
  for (const k of kras) {
    await run(`INSERT OR REPLACE INTO kras (id, timestamp, position_name, text, type) VALUES (?, ?, ?, ?, ?)`, [k.id, k.timestamp, k.position_name, k.text, k.type]);
  }

  const sops = [
    {
      id: 'SOP-SALES-101',
      timestamp: nowIso,
      position_name: 'Senior Sales Executive',
      kra_id: 'KRA-SALES-01',
      text: 'Lead Calling & Counseling SOP: Call leads within 2 hours, introduce course offerings, evaluate student goals, and schedule demo.',
      checklist: '1. Greet warmly\n2. Assess student background\n3. Pitch curriculum benefits\n4. Confirm demo booking date',
      form_fields: 'Lead ID, Call Status, Demo Date, Lead Quality',
      doc_link: 'https://drive.google.com/sample_sales_sop.pdf'
    },
    {
      id: 'SOP-ACAD-101',
      timestamp: nowIso,
      position_name: 'Senior Faculty Member',
      kra_id: 'KRA-ACAD-01',
      text: 'Classroom Lecture Delivery SOP: Verify lab readiness, conduct interactive 60-min session, take attendance, and log discussion notes.',
      checklist: '1. Check projector/board\n2. Mark attendance\n3. Deliver lecture with interactive Q&A\n4. Assign practice problems',
      form_fields: 'Class ID, Subject, Topic Covered, Attendance Count',
      doc_link: 'https://drive.google.com/sample_acad_sop.pdf'
    }
  ];
  for (const s of sops) {
    await run(`INSERT OR REPLACE INTO sops (id, timestamp, position_name, kra_id, text, checklist, form_fields, doc_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [s.id, s.timestamp, s.position_name, s.kra_id, s.text, s.checklist, s.form_fields, s.doc_link]);
  }

  // 5. Fallback Daily Report & Notifications
  const sampleBod = { task_calls: { value: 40, type: 'number' }, task_demos: { value: 5, type: 'number' }, task_followup: { status: 'Pending', type: 'checkbox' } };
  const sampleEod = { task_calls: { value: 38, type: 'number' }, task_demos: { value: 5, type: 'number' }, task_followup: { status: 'Done', type: 'checkbox' } };
  await run(
    `INSERT OR REPLACE INTO daily_reports (
      date, employee_id, department, bod_data, eod_data, system_score, last_updated,
      head_rating, final_score, attendance, overtime, approval_status, expiry_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [todayStr, 'TPC25107MR', 'Sales & Marketing', JSON.stringify(sampleBod), JSON.stringify(sampleEod), 98, nowIso, 100, 98, 'Present', 1.0, 'Approved', new Date(now.getTime() + 24 * 3600000).toISOString()]
  );

  await run(
    `INSERT OR REPLACE INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, ?)`,
    ['N_INIT_01', 'TPC25107MR', 'Welcome', 'Welcome to Daily Operations Hub. Please complete your morning BOD plan.', nowIso, 0]
  );

  console.log('[DB] ✅ Local fallback seed completed successfully.');
}
