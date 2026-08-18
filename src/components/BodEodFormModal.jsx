import React, { useState, useEffect } from 'react';

export default function BodEodFormModal({ isOpen, onClose, phase, config, initialBodData, initialEodData, onSave }) {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const initial = {};

    config.forEach((task) => {
      const taskKey = task.key;
      const existingBod = initialBodData && initialBodData[taskKey] ? initialBodData[taskKey] : null;
      const existingEod = initialEodData && initialEodData[taskKey] ? initialEodData[taskKey] : null;

      if (phase === 'BOD') {
        if (task.type === 'number') {
          initial[taskKey] = { value: existingBod ? existingBod.value : task.target || 0, type: 'number' };
        } else if (task.type === 'checkbox') {
          initial[taskKey] = { status: existingBod ? existingBod.status : 'Pending', type: 'checkbox' };
        } else if (task.type === 'categoryNumber') {
          initial[taskKey] = {
            type: 'categoryNumber',
            value: existingBod ? existingBod.value : task.target || 0,
            subCategories: existingBod?.subCategories || {}
          };
        } else if (task.type === 'dynamicList') {
          initial[taskKey] = {
            type: 'dynamicList',
            list: existingBod && existingBod.list ? existingBod.list : [
              { text: '', hasTarget: true, target: 1, achieved: 0, status: 'Pending', isVoluntary: false }
            ]
          };
        }
      } else {
        // EOD phase
        if (task.type === 'number') {
          initial[taskKey] = {
            value: existingEod ? existingEod.value : (existingBod ? existingBod.value : task.target || 0),
            type: 'number'
          };
        } else if (task.type === 'checkbox') {
          initial[taskKey] = {
            status: existingEod ? existingEod.status : 'Done',
            type: 'checkbox'
          };
        } else if (task.type === 'categoryNumber') {
          initial[taskKey] = {
            type: 'categoryNumber',
            value: existingEod ? existingEod.value : (existingBod ? existingBod.value : task.target || 0),
            subCategories: existingEod?.subCategories || existingBod?.subCategories || {}
          };
        } else if (task.type === 'dynamicList') {
          initial[taskKey] = {
            type: 'dynamicList',
            list: existingEod && existingEod.list ? existingEod.list : (
              existingBod && existingBod.list ? existingBod.list.map(item => ({ ...item, status: 'Done', achieved: item.target || 1 })) : [
                { text: '', hasTarget: true, target: 1, achieved: 1, status: 'Done', isVoluntary: false }
              ]
            )
          };
        }
      }
    });

    setFormData(initial);
  }, [isOpen, phase, config, initialBodData, initialEodData]);

  if (!isOpen) return null;

  const handleNumberChange = (key, val) => {
    setFormData(prev => ({
      ...prev,
      [key]: { ...prev[key], value: Number(val) }
    }));
  };

  const handleSubCategoryChange = (taskKey, catName, val) => {
    setFormData(prev => {
      const currentTask = prev[taskKey] || { type: 'categoryNumber', subCategories: {} };
      const updatedSub = { ...(currentTask.subCategories || {}), [catName]: Number(val) };
      const sum = Object.values(updatedSub).reduce((a, b) => a + (Number(b) || 0), 0);
      return {
        ...prev,
        [taskKey]: {
          ...currentTask,
          subCategories: updatedSub,
          value: sum
        }
      };
    });
  };

  const handleCheckboxChange = (key, isChecked) => {
    setFormData(prev => ({
      ...prev,
      [key]: { ...prev[key], status: isChecked ? 'Done' : 'Pending' }
    }));
  };

  const handleAddListItem = (taskKey) => {
    setFormData(prev => {
      const currentList = prev[taskKey]?.list || [];
      return {
        ...prev,
        [taskKey]: {
          ...prev[taskKey],
          list: [...currentList, { text: '', hasTarget: true, target: 1, achieved: 0, status: 'Pending', isVoluntary: false }]
        }
      };
    });
  };

  const handleRemoveListItem = (taskKey, index) => {
    setFormData(prev => {
      const currentList = [...(prev[taskKey]?.list || [])];
      currentList.splice(index, 1);
      return {
        ...prev,
        [taskKey]: { ...prev[taskKey], list: currentList }
      };
    });
  };

  const handleListItemChange = (taskKey, index, field, val) => {
    setFormData(prev => {
      const currentList = [...(prev[taskKey]?.list || [])];
      currentList[index] = { ...currentList[index], [field]: val };
      return {
        ...prev,
        [taskKey]: { ...prev[taskKey], list: currentList }
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(phase, formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save report.');
    } finally {
      setSaving(false);
    }
  };

  const computeLiveScore = () => {
    if (phase !== 'EOD' || !config || config.length === 0) return null;
    const scores = [];
    config.forEach(task => {
      const taskKey = task.key;
      const eTask = formData[taskKey];
      if (!eTask) return;
      const bTask = initialBodData && initialBodData[taskKey] ? initialBodData[taskKey] : {};
      let target = Number(bTask.value) || task.target || 1;
      let achieved = 0;

      if (eTask.type === 'dynamicList') {
        let tSum = 0;
        let aSum = 0;
        (eTask.list || []).forEach(item => {
          const itemTarget = item.hasTarget ? Number(item.target) || 1 : 1;
          const itemAchieved = item.hasTarget ? Number(item.achieved) || 0 : (item.status === 'Done' ? 1 : 0);
          if (item.isVoluntary) aSum += itemAchieved;
          else { tSum += itemTarget; aSum += itemAchieved; }
        });
        target = tSum || 1;
        achieved = aSum;
      } else if (eTask.type === 'checkbox') {
        achieved = eTask.status === 'Done' ? target : 0;
      } else if (eTask.type === 'number') {
        achieved = Number(eTask.value) || 0;
      } else if (eTask.type === 'categoryNumber') {
        if (eTask.subCategories) {
          achieved = Object.values(eTask.subCategories).reduce((s, v) => s + (Number(v) || 0), 0);
        } else {
          achieved = Number(eTask.value) || 0;
        }
      }

      const p = target <= 0 ? 100 : (achieved / target) * 100;
      scores.push(Math.min(100, Math.max(0, p)));
    });

    if (scores.length === 0) return 0;
    const total = scores.reduce((a, b) => a + b, 0);
    return Math.round(total / scores.length);
  };

  const liveScore = computeLiveScore();

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              {phase === 'BOD' ? '🌅 Beginning of Day (BOD) Plan' : '🌆 End of Day (EOD) Progress'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              {phase === 'BOD' ? 'Set today\'s targets and priority work items.' : 'Record actual completions and progress.'}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            {phase === 'EOD' && liveScore !== null && (
              <div style={{ background: 'var(--primary-light)', border: '1px solid #bfdbfe', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
                    ⚡ Real-Time Estimated System Score:
                  </span>
                  <strong style={{ fontSize: '1.25rem', color: liveScore >= 80 ? 'var(--success)' : liveScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {liveScore}%
                  </strong>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${liveScore}%`,
                      height: '100%',
                      background: liveScore >= 80 ? 'var(--success)' : liveScore >= 50 ? 'var(--warning)' : 'var(--danger)',
                      transition: 'width 0.25s ease, background 0.25s ease'
                    }}
                  />
                </div>
              </div>
            )}

            {config.map((task) => {
              const taskKey = task.key;
              const taskState = formData[taskKey] || {};

              return (
                <div
                  key={taskKey}
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '16px',
                    marginBottom: '16px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ink)' }}>
                      {task.label}
                    </label>
                    <span className="badge badge-auto" style={{ textTransform: 'uppercase', fontSize: '0.68rem' }}>
                      {task.type} {task.weight ? `(${task.weight}% weight)` : ''}
                    </span>
                  </div>
                  {task.description && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '12px' }}>
                      {task.description}
                    </p>
                  )}

                  {task.type === 'number' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                          {phase === 'BOD' ? 'Target Quantity' : 'Achieved Quantity'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          className="form-control"
                          value={taskState.value !== undefined ? taskState.value : 0}
                          onChange={(e) => handleNumberChange(taskKey, e.target.value)}
                        />
                      </div>
                      {phase === 'EOD' && initialBodData && initialBodData[taskKey] && (
                        <div style={{ background: 'white', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: '6px', textAlign: 'center' }}>
                          <small style={{ color: 'var(--ink-muted)', fontSize: '0.7rem', display: 'block' }}>Target</small>
                          <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>{initialBodData[taskKey].value || 0}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {task.type === 'categoryNumber' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '8px' }}>
                        {(Array.isArray(task.categories) && task.categories.length > 0 ? task.categories : ['General']).map((cat) => (
                          <div key={cat} style={{ background: 'white', border: '1px solid var(--line)', borderRadius: '6px', padding: '8px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                              {cat}
                            </span>
                            <input
                              type="number"
                              min="0"
                              className="form-control"
                              style={{ padding: '6px 8px' }}
                              value={taskState.subCategories?.[cat] !== undefined ? taskState.subCategories[cat] : 0}
                              onChange={(e) => handleSubCategoryChange(taskKey, cat, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--primary-light)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem' }}>
                        <span>Total Sum: <strong>{taskState.value || 0}</strong></span>
                        {phase === 'EOD' && initialBodData && initialBodData[taskKey] && (
                          <span style={{ color: 'var(--ink-muted)' }}>Target: <strong>{initialBodData[taskKey].value || task.target || 0}</strong></span>
                        )}
                      </div>
                    </div>
                  )}

                  {task.type === 'checkbox' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        style={{ width: '18px', height: '18px' }}
                        checked={taskState.status === 'Done'}
                        onChange={(e) => handleCheckboxChange(taskKey, e.target.checked)}
                      />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {taskState.status === 'Done' ? 'Completed / Done' : 'Pending Completion'}
                      </span>
                    </label>
                  )}

                  {task.type === 'dynamicList' && (
                    <div>
                      {(taskState.list || []).map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'white',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '10px',
                            marginBottom: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Action item / task title..."
                              value={item.text}
                              onChange={(e) => handleListItemChange(taskKey, idx, 'text', e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--danger)', padding: '6px 10px' }}
                              onClick={() => handleRemoveListItem(taskKey, idx)}
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                            {phase === 'BOD' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>Target Count:</span>
                                <input
                                  type="number"
                                  min="1"
                                  className="form-control"
                                  style={{ width: '80px', padding: '4px 8px' }}
                                  value={item.target || 1}
                                  onChange={(e) => handleListItemChange(taskKey, idx, 'target', Number(e.target.value))}
                                />
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>Achieved Count:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    className="form-control"
                                    style={{ width: '80px', padding: '4px 8px' }}
                                    value={item.achieved !== undefined ? item.achieved : 1}
                                    onChange={(e) => handleListItemChange(taskKey, idx, 'achieved', Number(e.target.value))}
                                  />
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={item.status === 'Done'}
                                    onChange={(e) => handleListItemChange(taskKey, idx, 'status', e.target.checked ? 'Done' : 'Pending')}
                                  />
                                  Completed
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '4px' }}
                        onClick={() => handleAddListItem(taskKey)}
                      >
                        <i className="bi bi-plus-lg"></i> Add Action Item
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : `Save ${phase} Report`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
