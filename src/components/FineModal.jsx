import React, { useState, useEffect } from 'react';

/**
 * Issue Fine Modal
 * Matches 1:1 with fineModal in D:\prime\bod and eod\index.html lines 552-590
 */
export default function FineModal({ isOpen, onClose, empId, empName, dateStr, headId, onIssueFine }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReason('');
      setFile(null);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid fine amount.');
      return;
    }
    if (!reason.trim()) {
      setError('Please describe the reason for the fine.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let docUrl = null;
      let docName = null;
      if (file) {
        docName = file.name;
        // If file uploaded, handle base64 or upload endpoint
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        docUrl = await base64Promise;
      }

      await onIssueFine({
        empId,
        empName,
        dateStr,
        amount: numAmount,
        reason: reason.trim(),
        headId,
        docUrl,
        docName
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to issue fine.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px', width: '95%' }}>
        {/* Modal Header matching index.html fineModal */}
        <div className="modal-header bg-danger text-white" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <h5 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            <i className="bi bi-exclamation-octagon me-2"></i>Issue Fine
          </h5>
          <button type="button" className="btn-close-white" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Modal Body matching index.html */}
          <div className="modal-body bg-light" style={{ padding: '20px' }}>
            {error && (
              <div className="alert alert-warning py-2 mb-3 small fw-bold">
                {error}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                Employee Name
              </label>
              <input
                type="text"
                className="form-control"
                value={empName || empId || ''}
                readOnly
                style={{ backgroundColor: '#f1f5f9' }}
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                Report Date
              </label>
              <input
                type="text"
                className="form-control"
                value={dateStr || ''}
                readOnly
                style={{ backgroundColor: '#f1f5f9' }}
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                Fine Amount (₹)
              </label>
              <input
                type="number"
                className="form-control"
                min="0.01"
                step="0.01"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                Fine Reason
              </label>
              <textarea
                className="form-control"
                rows="3"
                placeholder="Describe the reason for the fine"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              ></textarea>
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold" style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                Notice Document (PDF, Image, DOC, DOCX)
              </label>
              <input
                type="file"
                className="form-control"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <small className="text-muted d-block mt-1" style={{ fontSize: '0.72rem' }}>
                Optional: Upload official notice or evidence attachment.
              </small>
            </div>
          </div>

          {/* Modal Footer matching index.html */}
          <div className="modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger fw-bold" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2 spin" role="status" aria-hidden="true"></span>
                  Issuing...
                </>
              ) : (
                <>
                  <i className="bi bi-exclamation-octagon me-1"></i> Issue Fine
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
