import React, { useState, useEffect, useCallback } from 'react';

function formatAssignedDeadline(value) {
  if (!value) return 'No deadline';
  const d = new Date(String(value).replace('T', ' '));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AssignedTasksPanel({ empId, isModal = false, showToast }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ active: [], completed: [], taskScore: 0 });
  const [error, setError] = useState(null);
  const [submittingTaskId, setSubmittingTaskId] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (!empId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assigned-tasks/${empId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData({
          active: Array.isArray(json.data.active) ? json.data.active : [],
          completed: Array.isArray(json.data.completed) ? json.data.completed : [],
          taskScore: json.data.taskScore !== undefined ? json.data.taskScore : 0
        });
      } else {
        setError(json.message || 'Could not load assigned tasks.');
      }
    } catch (err) {
      console.error('AssignedTasks fetch error:', err);
      setError('Network error loading assigned tasks.');
    } finally {
      setLoading(false);
    }
  }, [empId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleToggleChecklist = async (itemId, currentDone) => {
    const nextDone = !currentDone;
    // Optimistic UI update
    setData(prev => {
      const nextActive = prev.active.map(t => ({
        ...t,
        subTasks: (t.subTasks || []).map(st => ({
          ...st,
          items: (st.items || []).map(it => (it.itemId === itemId ? { ...it, done: nextDone } : it))
        }))
      }));
      return { ...prev, active: nextActive };
    });

    try {
      const res = await fetch('/api/assigned-tasks/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, done: nextDone, by: empId })
      });
      const json = await res.json();
      if (!json.success) {
        if (showToast) showToast(json.message || 'Failed to update checklist item', 'warning');
      }
    } catch (err) {
      console.error('Checklist update error:', err);
      if (showToast) showToast('Network error updating checklist', 'danger');
    } finally {
      fetchTasks();
    }
  };

  const handleToggleSubTask = async (subTaskId, currentDone) => {
    const nextDone = !currentDone;
    // Optimistic UI update
    setData(prev => {
      const nextActive = prev.active.map(t => ({
        ...t,
        subTasks: (t.subTasks || []).map(st => (st.sid === subTaskId ? { ...st, status: nextDone ? 'Done' : 'Pending' } : st))
      }));
      return { ...prev, active: nextActive };
    });

    try {
      const res = await fetch('/api/assigned-tasks/subtask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subTaskId, done: nextDone, by: empId })
      });
      const json = await res.json();
      if (!json.success) {
        if (showToast) showToast(json.message || 'Failed to update sub-task', 'warning');
      }
    } catch (err) {
      console.error('Subtask update error:', err);
      if (showToast) showToast('Network error updating sub-task', 'danger');
    } finally {
      fetchTasks();
    }
  };

  const handleSubmitTask = async (taskId) => {
    setSubmittingTaskId(taskId);
    try {
      const res = await fetch('/api/assigned-tasks/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, by: empId })
      });
      const json = await res.json();
      if (json.success) {
        if (showToast) {
          showToast(json.late ? 'Task submitted after deadline.' : 'Task submitted successfully.', 'success');
        }
        await fetchTasks();
      } else {
        if (showToast) showToast(json.message || 'Could not submit task.', 'danger');
      }
    } catch (err) {
      console.error('Submit task error:', err);
      if (showToast) showToast('Network error submitting task.', 'danger');
    } finally {
      setSubmittingTaskId(null);
    }
  };

  const renderContent = () => {
    if (loading && (!data.active.length && !data.completed.length)) {
      return (
        <div className="text-center text-muted py-3 small">
          <span className="spinner-border spinner-border-sm me-2"></span>
          Loading assigned tasks...
        </div>
      );
    }

    if (error && (!data.active.length && !data.completed.length)) {
      return <div className="text-muted small py-2">{error}</div>;
    }

    if (!data.active.length && !data.completed.length) {
      return <div className="text-muted small py-2">No assigned tasks found.</div>;
    }

    return (
      <div>
        {/* Active Tasks */}
        {data.active.map(task => {
          const progress = Math.round(task.progress || 0);
          const priorityClass = task.priority === 'High' ? 'bg-danger' : (task.priority === 'Low' ? 'bg-secondary' : 'bg-warning text-dark');
          const isSubmitting = submittingTaskId === task.taskId;

          return (
            <div key={task.taskId} className="border rounded p-3 mb-3 bg-white shadow-sm">
              <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                <div>
                  <strong style={{ fontSize: '1rem', color: '#0B2447' }}>{task.taskName}</strong>
                  {task.instructions && (
                    <div className="small text-muted mt-1">{task.instructions}</div>
                  )}
                </div>
                <div className="d-flex gap-1 flex-wrap align-items-center">
                  <span className={`badge ${priorityClass}`}>{task.priority || 'Medium'}</span>
                  {task.overdue && <span className="badge bg-danger">Overdue</span>}
                  <span className="badge bg-light text-dark border">
                    {formatAssignedDeadline(task.deadline)}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="progress mt-3" style={{ height: '8px' }}>
                <div
                  className="progress-bar bg-primary"
                  role="progressbar"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>

              <div className="d-flex justify-content-between align-items-center mt-2">
                <span className="small text-muted fw-semibold">{progress}% complete</span>
                <button
                  type="button"
                  className="btn btn-sm btn-success fw-bold"
                  disabled={isSubmitting}
                  onClick={() => handleSubmitTask(task.taskId)}
                >
                  <i className="bi bi-check2-circle me-1"></i>
                  {isSubmitting ? 'Submitting...' : 'Submit Task'}
                </button>
              </div>

              {/* Sub-tasks and Checklist */}
              {(task.subTasks || []).length > 0 ? (
                <div className="mt-3 pt-2 border-top">
                  {task.subTasks.map(st => {
                    const subDone = st.status === 'Done';
                    return (
                      <div key={st.sid} className="border rounded p-2 mt-2 bg-light">
                        <div className="form-check fw-semibold mb-1">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`st-${st.sid}`}
                            checked={subDone}
                            onChange={() => handleToggleSubTask(st.sid, subDone)}
                          />
                          <label className="form-check-label" htmlFor={`st-${st.sid}`}>
                            {st.name || 'Sub-task'}
                          </label>
                        </div>

                        {/* Checklist items */}
                        {(st.items || []).length > 0 ? (
                          <div className="ms-4 mt-1">
                            {st.items.map(item => (
                              <div key={item.itemId} className="form-check small mb-1">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`item-${item.itemId}`}
                                  checked={Boolean(item.done)}
                                  onChange={() => handleToggleChecklist(item.itemId, Boolean(item.done))}
                                />
                                <label className="form-check-label text-muted" htmlFor={`item-${item.itemId}`}>
                                  {item.text || 'Checklist item'}
                                </label>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="small text-muted ms-4">No checklist items.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="small text-muted mt-2">No sub-tasks added.</div>
              )}
            </div>
          );
        })}

        {/* Recently Completed */}
        {data.completed.length > 0 && (
          <div className="mt-4 pt-2">
            <h6 className="text-success border-bottom pb-2 fw-bold">Recently Completed</h6>
            {data.completed.map(task => (
              <div key={task.taskId} className="d-flex justify-content-between align-items-center border rounded p-2 mb-2 bg-white">
                <div>
                  <strong>{task.taskName}</strong>
                  <div className="small text-muted">
                    {formatAssignedDeadline(task.completedAt || task.deadline)}
                  </div>
                </div>
                <span className={`badge ${task.completedLate ? 'bg-warning text-dark' : 'bg-success'}`}>
                  {task.completedLate ? 'Completed Late' : 'Completed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (isModal) {
    return (
      <div className="card p-3 mb-3 border-primary shadow-sm bg-white" id="assigned-tasks-panel">
        <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
          <h5 className="text-primary fw-bold mb-0">
            <i className="bi bi-list-check me-2"></i>
            Assigned Tasks
            <span className="badge bg-primary ms-2">{data.taskScore}%</span>
          </h5>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={fetchTasks}
            disabled={loading}
            title="Refresh assigned tasks"
          >
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>
        <p className="small text-muted mb-3">
          Checklist/sub-task par click karke complete karo — progress turant save hota hai. Pending tasks deadline tak roz yahan dikhenge, jab tak submit na karo.
        </p>
        {renderContent()}
      </div>
    );
  }

  return (
    <div className="app-card section-card mb-4">
      <div className="section-header flex-wrap">
        <div>
          <h2 className="section-title">
            <i className="bi bi-list-check text-primary me-2"></i>
            Assigned Tasks
            <span className="badge bg-primary ms-2" style={{ fontSize: '0.85rem' }}>
              {data.taskScore}%
            </span>
          </h2>
          <p className="section-description">
            Track tasks assigned by your head and update checklist progress.
          </p>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={fetchTasks} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>
      {renderContent()}
    </div>
  );
}
