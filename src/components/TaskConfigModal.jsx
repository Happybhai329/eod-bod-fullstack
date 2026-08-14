import React, { useState, useEffect } from 'react';

export default function TaskConfigModal({ isOpen, onClose, empId, empName, onSave }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !empId) return;
    setLoading(true);
    fetch(`/api/config/${empId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTasks(data.config || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, empId]);

  if (!isOpen) return null;

  const handleAddTask = () => {
    const newKey = 'task_' + Date.now();
    setTasks([
      ...tasks,
      {
        key: newKey,
        label: 'New Custom Task',
        type: 'number',
        target: 10,
        weight: 20,
        description: ''
      }
    ]);
  };

  const handleRemoveTask = (idx) => {
    const updated = [...tasks];
    updated.splice(idx, 1);
    setTasks(updated);
  };

  const handleChange = (idx, field, val) => {
    const updated = [...tasks];
    updated[idx] = { ...updated[idx], [field]: val };
    setTasks(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(empId, tasks);
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to save task config.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>⚙️ Task Setup for {empName} ({empId})</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              Configure daily BOD & EOD task templates, target weights, and metrics.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body">
            {loading ? (
              <p>Loading task configuration...</p>
            ) : tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-muted)' }}>
                No tasks assigned yet. Click "Add Task" below to configure tasks.
              </div>
            ) : (
              tasks.map((task, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '16px',
                    marginBottom: '12px'
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Task Title / Label"
                      value={task.label}
                      onChange={(e) => handleChange(idx, 'label', e.target.value)}
                    />
                    <select
                      className="form-select"
                      style={{ width: '160px' }}
                      value={task.type}
                      onChange={(e) => handleChange(idx, 'type', e.target.value)}
                    >
                      <option value="number">Numeric</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="dynamicList">Dynamic List</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => handleRemoveTask(idx)}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {task.type === 'number' && (
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Target Quantity</span>
                        <input
                          type="number"
                          className="form-control"
                          value={task.target || 0}
                          onChange={(e) => handleChange(idx, 'target', Number(e.target.value))}
                        />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Score Weight (%)</span>
                      <input
                        type="number"
                        className="form-control"
                        value={task.weight || 0}
                        onChange={(e) => handleChange(idx, 'weight', Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '8px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Brief task description or instructions..."
                      value={task.description || ''}
                      onChange={(e) => handleChange(idx, 'description', e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}

            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddTask}>
              <i className="bi bi-plus-lg"></i> Add New Task
            </button>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
