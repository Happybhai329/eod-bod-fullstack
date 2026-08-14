import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFilePath = path.join(__dirname, 'data_store.json');

let store = {
  departments: [],
  employees: [],
  user_configs: [],
  daily_reports: [],
  fines: [],
  notifications: [],
  kras: [],
  sops: []
};

function loadStore() {
  if (fs.existsSync(dbFilePath)) {
    try {
      const content = fs.readFileSync(dbFilePath, 'utf8');
      store = JSON.parse(content);
    } catch (e) {
      console.error('Failed to load JSON store, starting fresh', e);
    }
  }
}

function saveStore() {
  try {
    fs.writeFileSync(dbFilePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save JSON store', e);
  }
}

loadStore();

export async function query(sql, params = []) {
  const cleanSql = sql.trim().toLowerCase();

  if (cleanSql.includes('from departments')) {
    let res = [...store.departments];
    if (params.length > 0 && cleanSql.includes('where head_id =')) {
      res = res.filter(d => d.head_id === params[0]);
    }
    return res;
  }

  if (cleanSql.includes('from employees')) {
    let res = [...store.employees];
    if (cleanSql.includes('where status =')) {
      res = res.filter(e => e.status.toLowerCase() === 'active');
    }
    if (params.length > 0 && cleanSql.includes('where id =')) {
      res = res.filter(e => e.id === params[0]);
    }
    return res;
  }

  if (cleanSql.includes('from daily_reports')) {
    let res = [...store.daily_reports];
    if (cleanSql.includes('where employee_id =')) {
      res = res.filter(r => r.employee_id === params[0]);
    } else if (cleanSql.includes('where date = ? and employee_id = ?')) {
      res = res.filter(r => r.date === params[0] && r.employee_id === params[1]);
    }
    if (cleanSql.includes('order by id desc')) {
      res.sort((a, b) => b.id - a.id);
    }
    return res;
  }

  if (cleanSql.includes('from fines')) {
    let res = [...store.fines];
    if (params.length > 0 && cleanSql.includes('where employee_id =')) {
      res = res.filter(f => f.employee_id === params[0]);
    }
    if (cleanSql.includes('order by id desc')) {
      res.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
    }
    return res;
  }

  if (cleanSql.includes('from notifications')) {
    let res = [...store.notifications];
    if (params.length > 0 && cleanSql.includes('where employee_id =')) {
      res = res.filter(n => n.employee_id === params[0]);
    }
    if (cleanSql.includes('order by id desc')) {
      res.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
    }
    return res;
  }

  if (cleanSql.includes('from kras')) {
    let res = [...store.kras];
    if (params.length > 0 && cleanSql.includes('like')) {
      const term = params[0].replace(/%/g, '').toLowerCase();
      res = res.filter(k => (
        (k.id && k.id.toLowerCase().includes(term)) ||
        (k.position_name && k.position_name.toLowerCase().includes(term)) ||
        (k.text && k.text.toLowerCase().includes(term)) ||
        (k.type && k.type.toLowerCase().includes(term))
      ));
    }
    return res;
  }

  if (cleanSql.includes('from sops')) {
    let res = [...store.sops];
    if (params.length > 0 && cleanSql.includes('where kra_id =')) {
      res = res.filter(s => s.kra_id === params[0]);
    }
    return res;
  }

  return [];
}

export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function run(sql, params = []) {
  const cleanSql = sql.trim().toLowerCase();

  if (cleanSql.startsWith('insert or replace into user_configs')) {
    const [empId, configJson, lastUpdated] = params;
    const idx = store.user_configs.findIndex(c => c.employee_id === empId);
    const item = { employee_id: empId, config_json: configJson, last_updated: lastUpdated };
    if (idx >= 0) store.user_configs[idx] = item;
    else store.user_configs.push(item);
    saveStore();
    return { changes: 1 };
  }

  if (cleanSql.startsWith('insert into daily_reports')) {
    const id = store.daily_reports.length + 1;
    let item = {};
    if (params.length === 5) {
      item = { id, date: params[0], employee_id: params[1], department: params[2], bod_data: params[3], last_updated: params[4], approval_status: 'Pending Review' };
    } else {
      item = { id, date: params[0], employee_id: params[1], department: params[2], eod_data: params[3], system_score: params[4], last_updated: params[5], approval_status: 'Pending Review', expiry_timestamp: params[6] };
    }
    store.daily_reports.push(item);
    saveStore();
    return { lastID: id, changes: 1 };
  }

  if (cleanSql.startsWith('update daily_reports')) {
    if (params.length === 3 && cleanSql.includes('set bod_data =')) {
      const [bodData, lastUpdated, id] = params;
      const item = store.daily_reports.find(r => r.id === id);
      if (item) { item.bod_data = bodData; item.last_updated = lastUpdated; }
    } else if (cleanSql.includes('set eod_data =')) {
      const [eodData, sysScore, finalScore, lastUpdated, expiryTime, id] = params;
      const item = store.daily_reports.find(r => r.id === id);
      if (item) {
        item.eod_data = eodData;
        item.system_score = sysScore;
        item.final_score = finalScore;
        item.last_updated = lastUpdated;
        item.approval_status = 'Pending Review';
        item.expiry_timestamp = expiryTime;
      }
    } else if (cleanSql.includes('set head_rating =')) {
      const [rating, finalScore, attendance, overtime, ratingUpdated, raterName, approvalTime, ratedBy, ratedOn, id] = params;
      const item = store.daily_reports.find(r => r.id === id);
      if (item) {
        item.head_rating = rating;
        item.final_score = finalScore;
        item.attendance = attendance;
        item.overtime = overtime;
        item.rating_last_updated = ratingUpdated;
        item.rating_edited_by = raterName;
        item.approval_status = 'Approved';
        item.approval_timestamp = approvalTime;
        item.rated_by = ratedBy;
        item.rated_on = ratedOn;
      }
    } else if (cleanSql.includes('set fine_amount =')) {
      const [amount, reason, docUrl, docName, issuedOn, issuedBy, dateStr, empId] = params;
      const item = store.daily_reports.find(r => r.date === dateStr && r.employee_id === empId);
      if (item) {
        item.fine_amount = amount;
        item.fine_reason = reason;
        item.fine_doc_url = docUrl;
        item.fine_doc_name = docName;
        item.fine_issued_on = issuedOn;
        item.fine_issued_by = issuedBy;
        item.fine_status = 'Pending';
      }
    }
    saveStore();
    return { changes: 1 };
  }

  if (cleanSql.startsWith('insert into fines')) {
    const [id, empId, date, amount, reason, docUrl, docName, issuedOn, issuedBy, status, lastUpdated] = params;
    store.fines.push({ id, employee_id: empId, date, amount, reason, doc_url: docUrl, doc_name: docName, issued_on: issuedOn, issued_by: issuedBy, status, last_updated: lastUpdated });
    saveStore();
    return { changes: 1 };
  }

  if (cleanSql.startsWith('insert into notifications')) {
    const [id, empId, type, message, createdOn] = params;
    store.notifications.push({ id, employee_id: empId, type, message, created_on: createdOn, read: 0 });
    saveStore();
    return { changes: 1 };
  }

  if (cleanSql.startsWith('update notifications set read = 1')) {
    const empId = params[0];
    store.notifications.forEach(n => { if (n.employee_id === empId) n.read = 1; });
    saveStore();
    return { changes: 1 };
  }

  if (cleanSql.startsWith('update departments set head_id =')) {
    const [headId, headName, subDeptName] = params;
    const dept = store.departments.find(d => d.name === subDeptName);
    if (dept) { dept.head_id = headId; dept.head_name = headName; }
    saveStore();
    return { changes: 1 };
  }

  return { changes: 0 };
}

export async function initDatabase() {
  if (store.employees.length === 0) {
    store.departments = [
      { name: 'Sales & Marketing', parent: '', head_id: 'HEAD001', head_name: 'Rajesh Sharma (Head)', is_main: 1 },
      { name: 'Direct Sales', parent: 'Sales & Marketing', head_id: 'SUBHEAD01', head_name: 'Amit Patel (Sales Manager)', is_main: 0 },
      { name: 'Digital Marketing', parent: 'Sales & Marketing', head_id: 'SUBHEAD02', head_name: 'Priya Verma (Marketing Lead)', is_main: 0 },
      { name: 'Academic Operations', parent: '', head_id: 'HEAD002', head_name: 'Dr. Sunita Gupta (Academic Director)', is_main: 1 },
      { name: 'Faculty & Curriculum', parent: 'Academic Operations', head_id: 'SUBHEAD03', head_name: 'Vikram Singh (Head of Faculty)', is_main: 0 },
      { name: 'Human Resources', parent: '', head_id: 'HEAD003', head_name: 'Neha Kapoor (HR Head)', is_main: 1 },
      { name: 'Finance & Accounts', parent: '', head_id: 'HEAD004', head_name: 'Anil Agarwal (Finance Chief)', is_main: 1 }
    ];

    store.employees = [
      { id: 'HEAD001', name: 'Rajesh Sharma', department: 'Sales & Marketing', sub_department: '', designation: 'VP of Sales', role: 'Head', status: 'Active' },
      { id: 'SUBHEAD01', name: 'Amit Patel', department: 'Sales & Marketing', sub_department: 'Direct Sales', designation: 'Sales Manager', role: 'Head', status: 'Active' },
      { id: 'SUBHEAD02', name: 'Priya Verma', department: 'Sales & Marketing', sub_department: 'Digital Marketing', designation: 'Marketing Lead', role: 'Head', status: 'Active' },
      { id: 'TPC25107MR', name: 'Happy Bhasin', department: 'Sales & Marketing', sub_department: 'Direct Sales', designation: 'Senior Sales Executive', role: 'Employee', status: 'Active' },
      { id: 'TPC25108AD', name: 'Aditi Sharma', department: 'Sales & Marketing', sub_department: 'Digital Marketing', designation: 'SEO & Content Specialist', role: 'Employee', status: 'Active' },
      { id: 'HEAD002', name: 'Dr. Sunita Gupta', department: 'Academic Operations', sub_department: '', designation: 'Academic Director', role: 'Head', status: 'Active' },
      { id: 'SUBHEAD03', name: 'Vikram Singh', department: 'Academic Operations', sub_department: 'Faculty & Curriculum', designation: 'Faculty Lead', role: 'Head', status: 'Active' },
      { id: 'TPC25109HR', name: 'Harshraj Singh', department: 'Academic Operations', sub_department: 'Faculty & Curriculum', designation: 'Senior Faculty Member', role: 'Employee', status: 'Active' },
      { id: 'HEAD003', name: 'Neha Kapoor', department: 'Human Resources', sub_department: '', designation: 'Head of HR', role: 'Head', status: 'Active' },
      { id: 'TPC25110DV', name: 'Devash Verma', department: 'Human Resources', sub_department: '', designation: 'Recruitment Specialist', role: 'Employee', status: 'Active' },
      { id: 'HEAD004', name: 'Anil Agarwal', department: 'Finance & Accounts', sub_department: '', designation: 'Finance Chief', role: 'Head', status: 'Active' }
    ];

    const defaultConfigSales = [
      { key: 'task_calls', label: 'Outbound Client Calls', type: 'number', target: 40, weight: 30, description: 'Make outbound calls to student leads.' },
      { key: 'task_demos', label: 'Conduct Demo Sessions', type: 'number', target: 5, weight: 35, description: 'Schedule & host online demo classes.' },
      { key: 'task_followup', label: 'Follow up Pending Admissions', type: 'checkbox', weight: 15, description: 'Complete follow-ups for open inquiries.' },
      { key: 'task_list', label: 'Key Action Items', type: 'dynamicList', weight: 20, description: 'Daily custom list of key priorities.' }
    ];

    const defaultConfigAcademic = [
      { key: 'task_lectures', label: 'Deliver Scheduled Lectures', type: 'number', target: 4, weight: 40, description: 'Conduct interactive classroom sessions.' },
      { key: 'task_evaluation', label: 'Evaluate Test Papers', type: 'number', target: 25, weight: 30, description: 'Grade student subjective answer sheets.' },
      { key: 'task_doubt_session', label: 'Hold Student Doubt Clearing', type: 'checkbox', weight: 15, description: '1-on-1 doubt resolution session.' },
      { key: 'task_list', label: 'Special Academic Tasks', type: 'dynamicList', weight: 15, description: 'Curriculum updates & paper creation.' }
    ];

    store.user_configs = [
      { employee_id: 'TPC25107MR', config_json: JSON.stringify(defaultConfigSales), last_updated: new Date().toISOString() },
      { employee_id: 'TPC25108AD', config_json: JSON.stringify(defaultConfigSales), last_updated: new Date().toISOString() },
      { employee_id: 'TPC25109HR', config_json: JSON.stringify(defaultConfigAcademic), last_updated: new Date().toISOString() },
      { employee_id: 'HEAD001', config_json: JSON.stringify(defaultConfigSales), last_updated: new Date().toISOString() }
    ];

    store.kras = [
      { id: 'KRA-SALES-01', timestamp: new Date().toISOString(), position_name: 'Senior Sales Executive', text: 'Achieve monthly student enrollment targets and maintain high conversion rates.', type: 'Core Target' },
      { id: 'KRA-SALES-02', timestamp: new Date().toISOString(), position_name: 'Senior Sales Executive', text: 'Maintain CRM records and follow up with leads within 2 hours of inquiry.', type: 'Operational' },
      { id: 'KRA-ACAD-01', timestamp: new Date().toISOString(), position_name: 'Faculty Member', text: 'Deliver high quality lectures aligned with curriculum syllabus schedule.', type: 'Academic' }
    ];

    store.sops = [
      {
        id: 'SOP-SALES-101',
        timestamp: new Date().toISOString(),
        position_name: 'Senior Sales Executive',
        kra_id: 'KRA-SALES-01',
        text: 'Lead Calling & Counseling SOP: Call leads within 2 hours, introduce course offerings, evaluate student goals, and schedule demo.',
        checklist: '1. Greet warm \n2. Ask educational background \n3. Pitch course benefits \n4. Book demo date & send WhatsApp invite',
        form_fields: 'Lead ID, Call Status, Demo Date, Lead Quality Rating',
        doc_link: 'https://drive.google.com/sample_sales_sop.pdf'
      }
    ];

    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    store.daily_reports = [
      {
        id: 1,
        date: todayStr,
        employee_id: 'TPC25107MR',
        department: 'Sales & Marketing',
        bod_data: JSON.stringify({ task_calls: { value: 40, type: 'number' }, task_demos: { value: 5, type: 'number' }, task_followup: { status: 'Pending', type: 'checkbox' } }),
        eod_data: JSON.stringify({ task_calls: { value: 38, type: 'number' }, task_demos: { value: 4, type: 'number' }, task_followup: { status: 'Done', type: 'checkbox' } }),
        system_score: 92,
        last_updated: now.toISOString(),
        head_rating: 100,
        final_score: 92,
        attendance: 'Present',
        overtime: 1.5,
        approval_status: 'Pending Review',
        expiry_timestamp: new Date(now.getTime() + 24 * 3600000).toISOString()
      }
    ];

    saveStore();
  }
}
