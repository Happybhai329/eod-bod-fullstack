import React, { useState, useEffect } from 'react';

/**
 * Assign / Change Sub-Department Head Modal
 * Matches 1:1 with assignSubHeadModal in D:\prime\bod and eod\index.html lines 593-617
 */
export default function DepartmentStructureModal({ isOpen, onClose, user }) {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubDept, setSelectedSubDept] = useState('');
  const [selectedHeadId, setSelectedHeadId] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  const isAdmin = Boolean(user?.role?.toLowerCase().includes('admin') || user?.isAdmin || user?.isHead);

  useEffect(() => {
    if (!isOpen) return;
    fetchData();
    setMsg({ text: '', type: '' });
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hierarchy');
      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments || []);
        setEmployees(data.employees || []);
        if (data.departments?.length > 0 && !selectedSubDept) {
          setSelectedSubDept(data.departments[0].name);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignHead = async (e) => {
    e.preventDefault();
    if (!selectedSubDept || !selectedHeadId) {
      setMsg({ text: 'Please select a sub-department and an employee.', type: 'danger' });
      return;
    }

    setSaving(true);
    setMsg({ text: '', type: '' });

    try {
      const res = await fetch('/api/structure/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subDeptName: selectedSubDept, headId: selectedHeadId, requesterId: user?.id })
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ text: data.message || 'Assigned sub-department head successfully!', type: 'success' });
        setSelectedHeadId('');
        fetchData();
      } else {
        setMsg({ text: data.message || 'Failed to assign head.', type: 'danger' });
      }
    } catch (err) {
      setMsg({ text: 'Error connecting to server.', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveHead = async (subDeptName) => {
    if (!window.confirm(`Are you sure you want to remove the head from ${subDeptName}?`)) return;
    try {
      const res = await fetch('/api/structure/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subDeptName, requesterId: user?.id })
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ text: data.message || 'Removed head successfully.', type: 'success' });
        fetchData();
      } else {
        setMsg({ text: data.message || 'Failed to remove head.', type: 'danger' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '750px', width: '95%' }}>
        {/* Modal Header matching index.html assignSubHeadModal */}
        <div className="modal-header bg-navy text-white" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <h5 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            <i className="bi bi-diagram-3 me-2"></i>Assign Sub-Department Head
          </h5>
          <button type="button" className="btn-close-white" onClick={onClose}>×</button>
        </div>

        {/* Modal Body matching index.html */}
        <div className="modal-body bg-light" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '20px' }}>
          {msg.text && (
            <div className={`alert ${msg.type === 'success' ? 'alert-info' : 'alert-warning'} py-2 mb-3 small fw-bold`}>
              {msg.text}
            </div>
          )}

          {/* Sub-department selection & assignment form */}
          <form onSubmit={handleAssignHead} className="card p-3 mb-4 border" style={{ borderColor: '#e2e8f0' }}>
            <h6 className="fw-bold mb-3" style={{ fontSize: '0.9rem', color: '#13233f' }}>
              Assign or Change Head
            </h6>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label className="form-label fw-bold" style={{ fontSize: '0.8rem', marginBottom: '4px', display: 'block' }}>
                  Sub-department
                </label>
                <select
                  className="form-select"
                  value={selectedSubDept}
                  onChange={(e) => setSelectedSubDept(e.target.value)}
                >
                  {departments.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} {d.is_main ? '(Main Dept)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label fw-bold" style={{ fontSize: '0.8rem', marginBottom: '4px', display: 'block' }}>
                  Select Employee (Active)
                </label>
                <select
                  className="form-select"
                  value={selectedHeadId}
                  onChange={(e) => setSelectedHeadId(e.target.value)}
                >
                  <option value="">-- Choose Employee --</option>
                  {employees
                    .filter(e => e.status?.toLowerCase() === 'active')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.id}) - {e.department || e.role}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn btn-primary fw-bold"
                disabled={saving || !selectedHeadId}
                style={{ fontSize: '0.85rem' }}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2 spin"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-lg me-1"></i> Assign / Change
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Current Department Structure Table */}
          <h6 className="fw-bold mb-2" style={{ fontSize: '0.9rem', color: '#13233f' }}>
            Current Department Heads & Hierarchy
          </h6>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department / Sub-dept</th>
                  <th>Parent Dept</th>
                  <th>Current Head</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="text-center py-4 text-muted">
                      <span className="spinner-border spinner-border-sm me-2 spin"></span> Loading hierarchy...
                    </td>
                  </tr>
                ) : departments.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-4 text-muted">
                      No departments configured.
                    </td>
                  </tr>
                ) : (
                  departments.map((d) => (
                    <tr key={d.name}>
                      <td>
                        <strong>{d.name}</strong>
                        {d.is_main ? <span className="badge bg-primary ms-2" style={{ fontSize: '0.68rem' }}>Main</span> : ''}
                      </td>
                      <td>{d.parent || '-'}</td>
                      <td>
                        {d.head_name ? (
                          <span className="text-success fw-bold">
                            <i className="bi bi-person-check me-1"></i>
                            {d.head_name}
                          </span>
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {d.head_id && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleRemoveHead(d.name)}
                            title="Remove head"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer matching index.html */}
        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
