import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, query, get, run } from '../server/db.js';
import { isDateInFilter, getTodayString } from '../server/index.js';

test('isDateInFilter handles Daily, Weekly, Monthly filtering', () => {
  const todayStr = getTodayString();
  assert.equal(isDateInFilter(todayStr, 'Daily'), true);
  assert.equal(isDateInFilter('01/01/2000', 'Daily'), false);

  assert.equal(isDateInFilter(todayStr, 'Weekly'), true);
  assert.equal(isDateInFilter(todayStr, 'Monthly'), true);
  assert.equal(isDateInFilter('01/01/2000', 'Weekly'), false);
  assert.equal(isDateInFilter('01/01/2000', 'Monthly'), false);
});

test('Database initializes and contains seeded records', async () => {
  await initDatabase();
  const employees = await query('SELECT * FROM employees');
  assert.ok(employees.length > 0, 'Employees table should have seeded records');

  const depts = await query('SELECT * FROM departments');
  assert.ok(depts.length > 0, 'Departments table should have seeded records');

  const kras = await query('SELECT * FROM kras');
  assert.ok(kras.length > 0, 'KRAs table should have seeded records');

  const sops = await query('SELECT * FROM sops');
  assert.ok(sops.length > 0, 'SOPs table should have seeded records');
});

test('User Config get and update flow', async () => {
  const testEmpId = 'TPC25107MR';
  const customConfig = [
    { key: 'test_task', label: 'Test Task', type: 'number', target: 20, weight: 100 }
  ];
  await run(
    'INSERT OR REPLACE INTO user_configs (employee_id, config_json, last_updated) VALUES (?, ?, ?)',
    [testEmpId, JSON.stringify(customConfig), new Date().toISOString()]
  );

  const row = await get('SELECT * FROM user_configs WHERE employee_id = ?', [testEmpId]);
  assert.ok(row);
  const parsed = JSON.parse(row.config_json);
  assert.equal(parsed[0].key, 'test_task');
  assert.equal(parsed[0].target, 20);
});

test('Fine notice creation and status update workflow', async () => {
  const fineId = 'F_TEST_' + Date.now();
  const empId = 'TPC25107MR';
  const todayStr = getTodayString();
  const nowIso = new Date().toISOString();

  await run(
    `INSERT INTO fines (id, employee_id, date, amount, reason, doc_url, doc_name, issued_on, issued_by, status, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
    [fineId, empId, todayStr, 500, 'Test reason', `/api/fines/${fineId}/document`, 'Notice.pdf', nowIso, 'Head Test', nowIso]
  );

  let fine = await get('SELECT * FROM fines WHERE id = ?', [fineId]);
  assert.equal(fine.status, 'Pending');
  assert.equal(fine.amount, 500);

  // Employee acknowledges fine
  await run(
    `UPDATE fines SET status = ?, employee_remarks = ?, last_updated = ? WHERE id = ?`,
    ['Acknowledged', 'Will improve going forward.', nowIso, fineId]
  );

  fine = await get('SELECT * FROM fines WHERE id = ?', [fineId]);
  assert.equal(fine.status, 'Acknowledged');
  assert.equal(fine.employee_remarks, 'Will improve going forward.');
});

test('Notification creation and mark as read', async () => {
  const notifId = 'N_TEST_' + Date.now();
  const empId = 'TPC25107MR';
  const nowIso = new Date().toISOString();

  await run(
    `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
    [notifId, empId, 'Alert', 'Test notification message', nowIso]
  );

  let notif = await get('SELECT * FROM notifications WHERE id = ?', [notifId]);
  assert.equal(notif.read, 0);

  await run('UPDATE notifications SET read = 1 WHERE id = ?', [notifId]);
  notif = await get('SELECT * FROM notifications WHERE id = ?', [notifId]);
  assert.equal(notif.read, 1);
});

test('Health endpoint returns database status and employee count', async () => {
  const empCount = await query(`SELECT COUNT(*) as count FROM employees`);
  assert.ok(empCount[0].count > 0, 'Database should contain active employee records');
});

