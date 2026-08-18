import React, { useState, useEffect } from 'react';

export default function DepartmentStructureModal({ isOpen, onClose, user }) {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubDept, setSelectedSubDept] = useState('');
  const [selectedHeadId, setSelectedHeadId] = useState('');
  const [msg, setMsg] = useState('');

  const isAdmin = user?.role?.toLowerCase().includes('admin') || user?.isAdmin;

  useEffect(() => {
    if (!isOpen) return;
    fetchData();
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hierarchy');
      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments || []);
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignHead = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Unauthorized: Only System Administrators can reassign department heads.');
      return;
    }
    if (!selectedSubDept || !selectedHeadId) return;
    setMsg('');
    try {
      const res = await fetch('/api/structure/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subDeptName: selectedSubDept, headId: selectedHeadId, requesterId: user?.id })
      });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message);
        fetchData();
      } else {
        alert(data.message || 'Failed to assign head.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveHead = async (subDeptName) => {
    if (!isAdmin) {
      alert('Unauthorized: Only System Administrators can remove department heads.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove the head of ${subDeptName}? Employees will fallback to Department Head.`)) return;
    try {
      const res = await fetch('/api/structure/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subDeptName, requesterId: user?.id })
      });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message);
        fetchData();
      } else {
        alert(data.message || 'Failed to remove head.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const subDepts = departments.filter(d => d.parent && d.parent !== '');

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              🌿 {isAdmin ? 'Department Structure Administration' : 'Department Organizational Directory'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              {isAdmin ? 'System Administrator control for assigning and managing Sub-Department Heads.' : 'Overview of current organizational structure and designated heads.'}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="modal-body">
          {msg && (
            <div style={{ padding: '10px 14px', background: 'var(--success-light)', color: 'var(--success)', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', fontWeight: 600 }}>
              {msg}
            </div>
          )}

          {loading ? (
            <p>Loading hierarchy data...</p>
          ) : (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px' }}>Sub-Departments & Current Heads</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {subDepts.map((sd) => (
                    <div
                      key={sd.name}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface-raised)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{sd.name}</strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginLeft: '8px' }}>
                          (Parent: {sd.parent})
                        </span>
                        <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 600 }}>
                          Current Head: {sd.head_name || sd.headName || 'None (Managed by Dept Head)'}
                        </div>
                      </div>
                      {isAdmin && sd.head_id && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleRemoveHead(sd.name)}
                        >
                          Remove Head
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '20px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px' }}>
                    <i className="bi bi-shield-lock me-1"></i> Admin: Assign / Reassign Sub-Department Head
                  </h4>
                  <form onSubmit={handleAssignHead} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                      <label className="form-label">Sub-Department</label>
                      <select
                        className="form-select"
                        value={selectedSubDept}
                        onChange={(e) => setSelectedSubDept(e.target.value)}
                      >
                        <option value="">Select Sub-Department...</option>
                        {subDepts.map(sd => (
                          <option key={sd.name} value={sd.name}>{sd.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Assign Employee as Head</label>
                      <select
                        className="form-select"
                        value={selectedHeadId}
                        onChange={(e) => setSelectedHeadId(e.target.value)}
                      >
                        <option value="">Select Employee...</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name} ({emp.id}) - {emp.department}</option>
                        ))}
                      </select>
                    </div>

                    <button type="submit" className="btn btn-primary">
                      Assign Head
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

