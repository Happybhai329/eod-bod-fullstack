import React from 'react';

export default function ReportDetailModal({ isOpen, onClose, report }) {
  if (!isOpen || !report) return null;

  let bodData = null;
  let eodData = null;
  try { bodData = typeof report.bod_data === 'string' ? JSON.parse(report.bod_data) : report.bod_data; } catch (e) {}
  try { eodData = typeof report.eod_data === 'string' ? JSON.parse(report.eod_data) : report.eod_data; } catch (e) {}

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>📋 Report Details: {report.employee_id || report.empId}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              Date: {report.date} • Department: {report.department}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="modal-body">
          {/* Summary scores banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'var(--surface-raised)', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--line)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>System Score</span>
              <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--ink)' }}>{report.system_score ?? report.sysScore ?? 0}%</strong>
            </div>

            <div style={{ background: 'var(--surface-raised)', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--line)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Head Rating</span>
              <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--primary)' }}>
                {report.head_rating !== null && report.head_rating !== undefined ? `${report.head_rating}%` : 'Not Rated'}
              </strong>
            </div>

            <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>Final Score</span>
              <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--primary)' }}>
                {report.final_score !== null && report.final_score !== undefined ? `${report.final_score}%` : 'Pending'}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            <span><strong>Attendance:</strong> {report.attendance || 'Present'}</span>
            <span>•</span>
            <span><strong>Overtime:</strong> {report.overtime || 0} hrs</span>
            <span>•</span>
            <span><strong>Status:</strong> {report.approval_status || report.ratingStatus || 'Pending Review'}</span>
          </div>

          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px' }}>Tasks & Achievements Breakdown</h4>

          {!eodData && !bodData ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>No detailed task data recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.keys(eodData || bodData || {}).map((taskKey) => {
                const bTask = bodData ? bodData[taskKey] : null;
                const eTask = eodData ? eodData[taskKey] : null;

                return (
                  <div key={taskKey} style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px' }}>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      {taskKey.replace(/_/g, ' ').toUpperCase()}
                    </strong>

                    {eTask?.type === 'dynamicList' || bTask?.type === 'dynamicList' ? (
                      <div style={{ fontSize: '0.8rem' }}>
                        {(eTask?.list || bTask?.list || []).map((item, i) => (
                          <div key={i} style={{ padding: '4px 0', borderBottom: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                            <span>• {item.text || 'Action item'}</span>
                            <span style={{ fontWeight: 600, color: item.status === 'Done' ? 'var(--success)' : 'var(--warning)' }}>
                              {item.status || 'Pending'} ({item.achieved || 0} / {item.target || 1})
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : eTask?.type === 'categoryNumber' || bTask?.type === 'categoryNumber' ? (
                      <div style={{ fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '6px', color: 'var(--ink-muted)' }}>
                          <span>Target Total: <strong>{bTask?.value ?? 'N/A'}</strong></span>
                          <span>Achieved Total: <strong>{eTask?.value ?? 'N/A'}</strong></span>
                        </div>
                        {eTask?.subCategories && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                            {Object.entries(eTask.subCategories).map(([cat, val]) => (
                              <span key={cat} style={{ background: 'white', border: '1px solid var(--line)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                {cat}: <strong>{val}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', display: 'flex', gap: '16px' }}>
                        {bTask && <span>Target: <strong>{bTask.value ?? bTask.status ?? 'N/A'}</strong></span>}
                        {eTask && <span>Achieved: <strong>{eTask.value ?? eTask.status ?? 'N/A'}</strong></span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {report.fine_amount > 0 && (
            <div style={{ marginTop: '16px', background: 'var(--danger-light)', border: '1px solid #fca5a5', padding: '14px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>🛑 Fine Issued: ₹{report.fine_amount}</strong>
                {report.fine_doc_url && (
                  <a
                    href={report.fine_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  >
                    <i className="bi bi-file-earmark-text me-1"></i> View Official Notice
                  </a>
                )}
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--ink)', margin: '6px 0 0' }}>Reason: {report.fine_reason}</p>
              {report.fine_status && (
                <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                  Status: <strong>{report.fine_status}</strong>
                  {report.employee_remarks ? ` • Remarks: ${report.employee_remarks}` : ''}
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
