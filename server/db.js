import sqlite3 from 'sqlite3';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

let pgPool = null;
let sqliteDb = null;

// Auto-load .env file if DATABASE_URL is not present
if (!process.env.DATABASE_URL) {
  const envPaths = [
    path.join(__dirname, '../.env'),
    path.join(__dirname, '.env')
  ];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const content = fs.readFileSync(ep, 'utf-8');
        content.split(/\r?\n/).forEach(line => {
          const m = line.match(/^\s*([\w_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/);
          if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2];
          }
        });
      } catch (_) {}
      break;
    }
  }
}

let isPostgresActive = null;

export function getIsPostgres() {
  if (isPostgresActive !== null) return isPostgresActive;
  return Boolean(process.env.DATABASE_URL);
}

export function setIsPostgresActive(val) {
  isPostgresActive = val;
}

export function getPgPool() {
  if (!pgPool && process.env.DATABASE_URL) {
    console.log('[DB] 🐘 Initializing PostgreSQL engine (Supabase/Cloud)...');
    const pgConfig = getPgConfig(process.env.DATABASE_URL);
    pgPool = new Pool(pgConfig);
  }
  return pgPool;
}

export function getSqliteDb() {
  if (!sqliteDb) {
    console.log('[DB] 📁 Initializing SQLite engine (Local/Fallback)...');
    sqliteDb = new sqlite3.Database(dbPath);
  }
  return sqliteDb;
}

function getPgConfig(dbUrl) {
  try {
    const u = new URL(dbUrl);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 5432,
      database: u.pathname ? u.pathname.replace(/^\//, '') : 'postgres',
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000
    };
  } catch (e) {
    const m = dbUrl.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^:/]+)(?::(\d+))?\/(.+)$/);
    if (m) {
      return {
        user: m[1],
        password: m[2],
        host: m[3],
        port: m[4] ? parseInt(m[4], 10) : 5432,
        database: m[5].split('?')[0],
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000
      };
    }
    return { connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 };
  }
}

const CONFLICT_KEYS = {
  departments: ['name'],
  employees: ['id'],
  user_configs: ['employee_id'],
  daily_reports: ['date', 'employee_id'],
  fines: ['id'],
  notifications: ['id'],
  kras: ['id'],
  sops: ['id'],
  sync_logs: ['id']
};

// Note: For PostgreSQL, the syncEngine uses explicit ON CONFLICT clauses
// that match the actual unique constraints in Supabase (e.g., ON CONFLICT (id)
// for employees instead of ON CONFLICT ("employeeId")).
// The CONFLICT_KEYS above are used by transformInsertOrReplace() for
// automatic SQLite-to-PostgreSQL SQL translation only.

export function transformInsertOrReplace(sql) {
  const match = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i);
  if (!match) return sql;

  const tableName = match[1].trim();
  const rawCols = match[2];
  const rawValues = match[3];

  const cols = rawCols.split(',').map(c => c.trim().replace(/["`]/g, ''));
  const conflictKeys = CONFLICT_KEYS[tableName.toLowerCase()] || [];

  if (conflictKeys.length === 0) {
    return sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');
  }

  const updateCols = cols.filter(c => !conflictKeys.includes(c.toLowerCase()));
  const updateClause = updateCols.length > 0
    ? `DO UPDATE SET ${updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')}`
    : 'DO NOTHING';

  return `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${rawValues}) ON CONFLICT (${conflictKeys.map(k => `"${k}"`).join(', ')}) ${updateClause}`;
}

export function formatSql(sql) {
  if (!getIsPostgres()) return sql;
  let s = sql;
  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(s)) {
    s = transformInsertOrReplace(s);
  }
  let index = 0;
  return s.replace(/\?/g, () => `$${++index}`);
}

// Helper for promise-based queries
export function query(sql, params = []) {
  if (getIsPostgres()) {
    return getPgPool().query(formatSql(sql), params).then(res => res.rows);
  }
  return new Promise((resolve, reject) => {
    getSqliteDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function run(sql, params = []) {
  if (getIsPostgres()) {
    return getPgPool().query(formatSql(sql), params).then(res => ({
      lastID: null,
      changes: res.rowCount
    }));
  }
  return new Promise((resolve, reject) => {
    getSqliteDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  if (getIsPostgres()) {
    return getPgPool().query(formatSql(sql), params).then(res => res.rows[0] || null);
  }
  return new Promise((resolve, reject) => {
    getSqliteDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export async function initDatabase() {
  if (process.env.DATABASE_URL) {
    try {
      const pool = getPgPool();
      await pool.query('SELECT 1');
      setIsPostgresActive(true);
      console.log('[DB] ✅ PostgreSQL connection established successfully.');
    } catch (pgErr) {
      console.warn(`[DB] ⚠️ PostgreSQL connection failed: ${pgErr.message}`);
      console.warn('[DB] 📁 Falling back to local SQLite database so application stays running.');
      setIsPostgresActive(false);
      if (pgPool) {
        try { await pgPool.end(); } catch (_) {}
        pgPool = null;
      }
    }
  } else {
    setIsPostgresActive(false);
  }

  const isPostgres = getIsPostgres();
  if (!isPostgres) {
    await run(`PRAGMA foreign_keys = ON;`);
  }

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

  if (isPostgres) {
    // Schema alignment for existing PostgreSQL/Supabase tables
    await query(`
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS name TEXT;
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent TEXT;
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS head_id TEXT;
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS head_name TEXT;
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_main INTEGER DEFAULT 1;

      DO $$ BEGIN
        ALTER TABLE departments ALTER COLUMN "departmentId" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE departments ALTER COLUMN "departmentName" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE departments ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE departments ALTER COLUMN "createdAt" SET DEFAULT NOW();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE departments ALTER COLUMN "updatedAt" SET DEFAULT NOW();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_id TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS sub_department TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS other_department TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT;

      DO $$ BEGIN
        ALTER TABLE employees ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE employees ALTER COLUMN "employeeId" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE employees ALTER COLUMN "createdAt" SET DEFAULT NOW();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE employees ALTER COLUMN "updatedAt" SET DEFAULT NOW();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      DO $$ BEGIN
        UPDATE employees SET emp_id = COALESCE(emp_id, "employeeId", id) WHERE emp_id IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE employees SET "employeeId" = COALESCE("employeeId", emp_id, id) WHERE "employeeId" IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE departments SET name = COALESCE(name, "departmentName") WHERE name IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE departments SET "departmentName" = COALESCE("departmentName", name) WHERE "departmentName" IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE departments SET "departmentId" = COALESCE("departmentId", 'DEPT_' || name) WHERE "departmentId" IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE departments SET head_id = COALESCE(head_id, "headId") WHERE head_id IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE departments SET head_name = COALESCE(head_name, "headName") WHERE head_name IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE employees SET sub_department = COALESCE(sub_department, "subDepartment") WHERE sub_department IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        UPDATE employees SET designation = COALESCE(designation, role) WHERE designation IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      DO $$ BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_id ON employees(id);
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      DO $$ BEGIN
        UPDATE daily_reports SET 
          date = COALESCE(date, "reportDate"),
          employee_id = COALESCE(employee_id, "employeeId"),
          department = COALESCE(department, "departmentName"),
          system_score = COALESCE(system_score, "systemScore"),
          final_score = COALESCE(final_score, "finalScore"),
          last_updated = COALESCE(last_updated, "lastUpdated"::text);
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      DO $$ BEGIN
        UPDATE daily_reports SET 
          "reportDate" = COALESCE("reportDate", date),
          "employeeId" = COALESCE("employeeId", employee_id),
          "departmentName" = COALESCE("departmentName", department),
          "systemScore" = COALESCE("systemScore", system_score),
          "finalScore" = COALESCE("finalScore", final_score);
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "employeeId" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "reportDate" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "dateTimestamp" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "departmentName" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "systemScore" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "finalScore" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "lastUpdated" DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS "daily_reports_employeeId_fkey";
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS "daily_reports_employeeId_reportDate_key";
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "createdAt" SET DEFAULT NOW();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "updatedAt" SET DEFAULT NOW();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;

      DO $$ BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_date_emp ON daily_reports(date, employee_id);
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "systemScore" DROP DEFAULT;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE daily_reports ALTER COLUMN "finalScore" DROP DEFAULT;
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
    `);
  } else {
    try {
      await run(`ALTER TABLE employees ADD COLUMN emp_id TEXT;`);
    } catch (e) {
      // Column may already exist
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS user_configs (
      employee_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      last_updated TEXT NOT NULL
    )
  `);

  if (isPostgres) {
    await run(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
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
  } else {
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
  }

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

  await run(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      error_message TEXT
    )
  `);

  await seedInitialData();
}

async function seedInitialData() {
  const existingEmps = await query(`SELECT COUNT(*) as count FROM employees`);
  if (Number(existingEmps[0]?.count) > 0) {
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
    { name: 'Curriculum & Faculty', parent: 'Academic Operations', head_id: 'SUBHEAD03', head_name: 'Vikram Singh (SUBHEAD03)', is_main: 0 },
    { name: 'Exam & Evaluations', parent: 'Academic Operations', head_id: 'SUBHEAD04', head_name: 'Anjali Deshmukh (SUBHEAD04)', is_main: 0 },
    { name: 'Human Resources', parent: '', head_id: 'HEAD003', head_name: 'Kavita Nair (HEAD003)', is_main: 1 },
    { name: 'Finance & Accounts', parent: '', head_id: 'HEAD004', head_name: 'Suresh Menon (HEAD004)', is_main: 1 }
  ];
  for (const d of departments) {
    await run(
      `INSERT OR REPLACE INTO departments (name, parent, head_id, head_name, is_main) VALUES (?, ?, ?, ?, ?)`,
      [d.name, d.parent, d.head_id, d.head_name, d.is_main]
    );
  }

  // 2. Fallback Employees
  const employees = [
    { id: 'TPC25107MR', name: 'Rohan Mehra', department: 'Sales & Marketing', sub_department: 'Direct Sales', other_department: '', designation: 'Senior Sales Executive', role: 'Employee', status: 'Active' },
    { id: 'TPC25108AD', name: 'Neha Kapoor', department: 'Sales & Marketing', sub_department: 'Digital Marketing', other_department: '', designation: 'Campaign Specialist', role: 'Employee', status: 'Active' },
    { id: 'TPC25109HR', name: 'Anil Kulkarni', department: 'Academic Operations', sub_department: 'Curriculum & Faculty', other_department: '', designation: 'Senior Academic Coordinator', role: 'Employee', status: 'Active' },
    { id: 'TPC25110EX', name: 'Meera Iyer', department: 'Academic Operations', sub_department: 'Exam & Evaluations', other_department: '', designation: 'Evaluation Controller', role: 'Employee', status: 'Active' },
    { id: 'HEAD001', name: 'Rajesh Sharma', department: 'Sales & Marketing', sub_department: '', other_department: '', designation: 'Head of Sales', role: 'Head', status: 'Active' },
    { id: 'HEAD002', name: 'Dr. Sunita Gupta', department: 'Academic Operations', sub_department: '', other_department: '', designation: 'Academic Director', role: 'Head', status: 'Active' },
    { id: 'ADMIN01', name: 'Central Admin', department: 'Executive Operations', sub_department: '', other_department: '', designation: 'System Administrator', role: 'Admin', status: 'Active' }
  ];
  for (const e of employees) {
    await run(
      `INSERT OR REPLACE INTO employees (id, name, department, sub_department, other_department, designation, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.name, e.department, e.sub_department, e.other_department, e.designation, e.role, e.status]
    );
  }

  // 3. Fallback User Task Configurations
  const salesConfig = [
    { key: 'telecalling', label: 'Inbound / Outbound Calls', type: 'number', target: 40, weight: 35 },
    { key: 'demos_scheduled', label: 'Product Demos Booked', type: 'number', target: 5, weight: 35 },
    { key: 'crm_update', label: 'CRM Pipeline Clean & Updated', type: 'checkbox', target: 1, weight: 30 }
  ];
  const academicConfig = [
    { key: 'lectures_conducted', label: 'Lectures / Sessions Delivered', type: 'number', target: 4, weight: 40 },
    { key: 'student_doubts', label: 'Student Doubt Clearance', type: 'number', target: 15, weight: 30 },
    { key: 'curriculum_review', label: 'Weekly Curriculum Sync', type: 'checkbox', target: 1, weight: 30 }
  ];
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['TPC25107MR', JSON.stringify(salesConfig), nowIso]);
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['TPC25108AD', JSON.stringify(salesConfig), nowIso]);
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['TPC25109HR', JSON.stringify(academicConfig), nowIso]);
  await run(`INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)`, ['HEAD001', JSON.stringify(salesConfig), nowIso]);

  // 4. Fallback KRAs
  const kras = [
    { id: 'KRA01', timestamp: nowIso, position_name: 'Senior Sales Executive', text: 'Achieve monthly lead conversion quotas and student enrollments.', type: 'Core' },
    { id: 'KRA02', timestamp: nowIso, position_name: 'Senior Academic Coordinator', text: 'Ensure 100% syllabus coverage on schedule with top student satisfaction ratings.', type: 'Core' },
    { id: 'KRA03', timestamp: nowIso, position_name: 'Head of Sales', text: 'Drive overall revenue target and team performance standards.', type: 'Leadership' }
  ];
  for (const k of kras) {
    await run(`INSERT OR REPLACE INTO kras (id, timestamp, position_name, text, type) VALUES (?, ?, ?, ?, ?)`, [k.id, k.timestamp, k.position_name, k.text, k.type]);
  }

  // 5. Fallback SOPs
  const sops = [
    {
      id: 'SOP01',
      timestamp: nowIso,
      position_name: 'Senior Sales Executive',
      kra_id: 'KRA01',
      text: 'Standard Operating Procedure for Inbound Lead Qualification and CRM Entry.',
      checklist: JSON.stringify(['Answer lead within 5 mins', 'Identify student background & goal', 'Log notes in CRM', 'Schedule live demonstration']),
      form_fields: JSON.stringify(['Student Name', 'Phone', 'Course of Interest', 'Trial Date']),
      doc_link: 'https://docs.google.com/document/d/example-sop1'
    },
    {
      id: 'SOP02',
      timestamp: nowIso,
      position_name: 'Senior Academic Coordinator',
      kra_id: 'KRA02',
      text: 'Faculty Classroom Attendance, Syllabus Delivery & Milestone Verification.',
      checklist: JSON.stringify(['Verify attendance sheet', 'Deliver prepared lesson plan', 'Assign homework practice', 'Address student questions']),
      form_fields: JSON.stringify(['Batch Code', 'Topic Covered', 'Attendance Count']),
      doc_link: 'https://docs.google.com/document/d/example-sop2'
    }
  ];
  for (const s of sops) {
    await run(`INSERT OR REPLACE INTO sops (id, timestamp, position_name, kra_id, text, checklist, form_fields, doc_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [s.id, s.timestamp, s.position_name, s.kra_id, s.text, s.checklist, s.form_fields, s.doc_link]);
  }

  // 6. Sample Daily Report
  const sampleBod = { telecalling: { type: 'number', value: 40 }, demos_scheduled: { type: 'number', value: 5 }, crm_update: { type: 'checkbox', status: 'Pending' } };
  const sampleEod = { telecalling: { type: 'number', value: 38 }, demos_scheduled: { type: 'number', value: 5 }, crm_update: { type: 'checkbox', status: 'Done' } };
  await run(
    `INSERT OR REPLACE INTO daily_reports (
      date, employee_id, department, bod_data, eod_data, system_score, last_updated,
      head_rating, final_score, attendance, overtime, approval_status, approval_timestamp, rated_by, rated_on
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [todayStr, 'TPC25107MR', 'Sales & Marketing', JSON.stringify(sampleBod), JSON.stringify(sampleEod), 98, nowIso, 100, 98, 'Present', 0, 'Approved', nowIso, 'Rajesh Sharma (HEAD001)', nowIso]
  );

  // 7. Sample Notification
  await run(
    `INSERT OR REPLACE INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, ?)`,
    ['N_INIT_001', 'TPC25107MR', 'Welcome', 'Welcome to the Daily Operations Hub! Your workspace is ready.', nowIso, 0]
  );

  console.log('[DB] ✅ Comprehensive fallback database seeded successfully.');
}
