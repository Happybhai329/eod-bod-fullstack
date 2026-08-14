import React, { useState } from 'react';

export default function FineModal({ isOpen, onClose, empId, dateStr, headId, onIssueFine }) {
  const [amount, setAmount] = useState(500);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError('Please enter a valid fine amount.');
      return;
    }
    if (!reason.trim()) {
      setError('Reason for issuing fine is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      await onIssueFine({ empId, dateStr, amount: Number(amount), reason: reason.trim(), headId });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to issue fine.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--danger)' }}>
              🛑 Issue Fine Notice for {empId}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              Task Date: {dateStr}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Fine Amount (₹)</label>
              <input
                type="number"
                min="50"
                step="50"
                className="form-control"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Reason for Fine</label>
              <textarea
                className="form-control"
                rows="4"
                placeholder="Specify failure reason, uncompleted mandatory BOD/EOD tasks, or policy infraction..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              ></textarea>
            </div>

            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              <i className="bi bi-file-earmark-pdf text-danger me-1"></i> An official fine notice PDF reference will be generated and dispatched to the employee's notification drawer.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Issuing...' : 'Issue Fine Notice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
