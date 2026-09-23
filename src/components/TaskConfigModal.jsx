import React, { useState, useEffect } from 'react';

/**
 * Task Setup & Configuration Modal
 * Matches 1:1 with setupModal in D:\prime\bod and eod\index.html lines 2074-2205
 * Schema: [{ taskName, inputType, displayPhase, subCategories, subCategoryPhase }]
 */
export default function TaskConfigModal({ isOpen, onClose, empId, empName, onSave }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!isOpen || !empId) return;
    setLoading(true);
    setStatusMsg({ text: '', type: '' });
    fetch(`/api/config/${empId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.config) && data.config.length > 0) {
          const normalized = data.config.map((t, idx) => ({
            taskName: (t.taskName || t.label || t.name || `Task ${idx + 1}`).trim(),
            inputType: t.inputType || t.type || 'number',
            displayPhase: t.displayPhase || 'BOTH',
            subCategories: Array.isArray(t.subCategories)
              ? t.subCategories
              : (Array.isArray(t.categories)
                  ? t.categories
                  : (typeof t.subCategories === 'string' ? t.subCategories.split(',').map(s => s.trim()) : [])),
            subCategoryPhase: t.subCategoryPhase || 'EOD'
          }));
          setTasks(normalized);
        } else {
          // Default initial empty task row
          setTasks([
            { taskName: '', inputType: 'number', displayPhase: 'BOTH', subCategories: [], subCategoryPhase: 'EOD' }
          ]);
        }
      })
      .catch(err => {
        console.error(err);
        setTasks([
          { taskName: '', inputType: 'number', displayPhase: 'BOTH', subCategories: [], subCategoryPhase: 'EOD' }
        ]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, empId]);

  if (!isOpen) return null;

  const handleAddTask = () => {
    setTasks(prev => [
      ...prev,
      { taskName: '', inputType: 'number', displayPhase: 'BOTH', subCategories: [], subCategoryPhase: 'EOD' }
    ]);
  };

  const handleRemoveTask = (idx) => {
    setTasks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleChange = (idx, field, val) => {
    setTasks(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const handleSave = async () => {
    const validTasks = [];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const name = (t.taskName || '').trim();
      if (name !== '') {
        const item = {
          taskName: name,
          inputType: t.inputType || 'number',
          displayPhase: t.displayPhase || 'BOTH'
        };
        if (item.inputType === 'categoryNumber') {
          const subcats = Array.isArray(t.subCategories)
            ? t.subCategories
            : (typeof t.subCategories === 'string' ? t.subCategories.split(',').map(s => s.trim()).filter(Boolean) : []);
          if (subcats.length === 0) {
            alert(`Please define categories for: ${name}`);
            return;
          }
          item.subCategories = subcats;
          item.subCategoryPhase = t.subCategoryPhase || 'EOD';
        }
        validTasks.push(item);
      }
    }

    if (validTasks.length === 0) {
      alert('Please add at least one task.');
      return;
    }

    setSaving(true);
    setStatusMsg({ text: '', type: '' });

    try {
      await onSave(empId, validTasks);
      setStatusMsg({ text: 'Setup Saved Successfully!', type: 'success' });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setStatusMsg({ text: `Error: ${err.message || 'Failed to save config'}`, type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px', width: '95%' }}>
        {/* Modal Header matching index.html setupModal */}
        <div className="modal-header bg-navy text-white" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <h5 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            Setup Config: <span style={{ color: '#f6bd3b' }}>{empName}</span>
          </h5>
          <button type="button" className="btn-close-white" onClick={onClose}>×</button>
        </div>

        {/* Modal Body matching index.html */}
        <div className="modal-body bg-light" style={{ maxHeight: '75vh', overflowY: 'auto', padding: '20px' }}>
          {loading ? (
            <div className="text-center text-primary mb-3 py-4 fw-bold">
              <i className="bi bi-arrow-repeat spin me-2"></i> Loading Existing Configuration...
            </div>
          ) : (
            <div id="task-list-container">
              {tasks.map((task, idx) => {
                const isCatNum = task.inputType === 'categoryNumber';
                const subcatString = Array.isArray(task.subCategories)
                  ? task.subCategories.join(', ')
                  : (task.subCategories || '');

                return (
                  <div
                    key={idx}
                    className="task-row border rounded p-3 mb-3 bg-white shadow-sm"
                    style={{ borderColor: '#e2e8f0' }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 100px', gap: '12px', alignItems: 'flex-end' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px', display: 'block' }}>
                          Task Name
                        </label>
                        <input
                          type="text"
                          className="form-control task-name"
                          placeholder="e.g. Inbound Operations"
                          value={task.taskName}
                          onChange={(e) => handleChange(idx, 'taskName', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px', display: 'block' }}>
                          Input Type
                        </label>
                        <select
                          className="form-select task-type"
                          value={task.inputType}
                          onChange={(e) => handleChange(idx, 'inputType', e.target.value)}
                        >
                          <option value="number">Number / Target</option>
                          <option value="checkbox">Yes/No (Done/Not Done)</option>
                          <option value="categoryNumber">Category & Numbers</option>
                          <option value="dynamicList">Dynamic Text List (Items)</option>
                        </select>
                      </div>

                      <div>
                        <label className="form-label text-primary" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px', display: 'block' }}>
                          Main Task Phase
                        </label>
                        <select
                          className="form-select task-phase border-primary"
                          value={task.displayPhase}
                          onChange={(e) => handleChange(idx, 'displayPhase', e.target.value)}
                        >
                          <option value="BOTH">BOD & EOD</option>
                          <option value="BOD_ONLY">BOD Only</option>
                          <option value="EOD_ONLY">EOD Only</option>
                        </select>
                      </div>

                      <div>
                        <button
                          type="button"
                          className="btn btn-outline-danger w-100"
                          style={{ height: '38px', fontWeight: 600, fontSize: '0.85rem' }}
                          onClick={() => handleRemoveTask(idx)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Sub-categories section for categoryNumber */}
                    {isCatNum && (
                      <div
                        className="subcat-container mt-3 p-3 bg-white border border-success rounded"
                        style={{ borderStyle: 'solid', borderWidth: '1px' }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                          <div>
                            <label className="form-label text-success fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                              Sub-categories (Comma Separated)
                            </label>
                            <input
                              type="text"
                              className="form-control subcat-input border-success"
                              placeholder="e.g. Calls, Inquiries, Walk-ins"
                              value={subcatString}
                              onChange={(e) => {
                                const arr = e.target.value.split(',').map(s => s.trim());
                                handleChange(idx, 'subCategories', arr);
                              }}
                            />
                          </div>

                          <div>
                            <label className="form-label text-success fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                              Sub-category Phase
                            </label>
                            <select
                              className="form-select subcat-phase border-success"
                              value={task.subCategoryPhase || 'EOD'}
                              onChange={(e) => handleChange(idx, 'subCategoryPhase', e.target.value)}
                            >
                              <option value="EOD">Only EOD</option>
                              <option value="BOD">Only BOD</option>
                              <option value="BOTH">Both BOD & EOD</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="btn btn-success w-100 mt-2 py-2 fw-bold"
            style={{ fontSize: '0.95rem' }}
            onClick={handleAddTask}
          >
            + Add New Task
          </button>
        </div>

        {/* Modal Footer matching index.html */}
        <div className="modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
          <span className={`fw-bold me-auto ${statusMsg.type === 'success' ? 'text-success' : 'text-danger'}`}>
            {statusMsg.text}
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-gold fw-bold"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2 spin" role="status" aria-hidden="true"></span>
                  Saving...
                </>
              ) : 'Save Config'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
