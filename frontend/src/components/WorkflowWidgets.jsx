import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  bulkStatusChange,
  bulkPromote,
  bulkTransfer,
  bulkFeeUpdate,
  bulkAssignTeacher,
  getApprovalQueue,
} from '../services/bulkOperationsService';

/* ─── BulkActionDialog ────────────────────────────────────── */
export function BulkActionDialog({ open, onClose, action, selectedCount, onConfirm, children }) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      toast.success(`Bulk ${action} completed`);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Bulk operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bulk-action-dialog" onClick={e => e.stopPropagation()}>
        <div className="bulk-action-dialog__header">
          <h3>Confirm Bulk {action}</h3>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>
        <div className="bulk-action-dialog__body">
          <p className="bulk-action-dialog__count">
            This will affect <strong>{selectedCount}</strong> student{selectedCount !== 1 ? 's' : ''}.
          </p>
          {children}
        </div>
        <div className="bulk-action-dialog__footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Processing...' : `Apply to ${selectedCount}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── BulkOperationsToolbar ───────────────────────────────── */
export function BulkOperationsToolbar({ selectedIds, onComplete, levels = [], batches = [], teachers = [] }) {
  const [dialog, setDialog] = useState(null);
  const [formData, setFormData] = useState({});

  if (!selectedIds?.length) return null;

  function closeDialog() {
    setDialog(null);
    setFormData({});
  }

  return (
    <>
      <div className="bulk-ops-toolbar">
        <span className="bulk-ops-toolbar__count">{selectedIds.length} selected</span>
        <button className="btn btn-sm btn-success" onClick={() => setDialog('activate')}>Activate</button>
        <button className="btn btn-sm btn-warning" onClick={() => setDialog('deactivate')}>Deactivate</button>
        {levels.length > 0 && (
          <button className="btn btn-sm btn-primary" onClick={() => setDialog('promote')}>Promote Level</button>
        )}
        {batches.length > 0 && (
          <button className="btn btn-sm btn-info" onClick={() => setDialog('transfer')}>Transfer Batch</button>
        )}
        {teachers.length > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={() => setDialog('teacher')}>Assign Teacher</button>
        )}
        <button className="btn btn-sm btn-outline" onClick={() => setDialog('fees')}>Update Fees</button>
      </div>

      <BulkActionDialog
        open={dialog === 'activate'}
        onClose={closeDialog}
        action="Activate"
        selectedCount={selectedIds.length}
        onConfirm={async () => {
          await bulkStatusChange(selectedIds, true);
          onComplete?.();
        }}
      >
        <p>All selected students will be set to <strong>Active</strong>.</p>
      </BulkActionDialog>

      <BulkActionDialog
        open={dialog === 'deactivate'}
        onClose={closeDialog}
        action="Deactivate"
        selectedCount={selectedIds.length}
        onConfirm={async () => {
          await bulkStatusChange(selectedIds, false);
          onComplete?.();
        }}
      >
        <p>All selected students will be <strong>Deactivated</strong>. Their enrollments will also be deactivated.</p>
      </BulkActionDialog>

      <BulkActionDialog
        open={dialog === 'promote'}
        onClose={closeDialog}
        action="Promote"
        selectedCount={selectedIds.length}
        onConfirm={async () => {
          if (!formData.levelId) throw new Error('Select a level');
          await bulkPromote(selectedIds, formData.levelId);
          onComplete?.();
        }}
      >
        <label className="form-label">Target Level</label>
        <select className="form-select" value={formData.levelId || ''} onChange={e => setFormData({ ...formData, levelId: e.target.value })}>
          <option value="">Select level...</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </BulkActionDialog>

      <BulkActionDialog
        open={dialog === 'transfer'}
        onClose={closeDialog}
        action="Transfer"
        selectedCount={selectedIds.length}
        onConfirm={async () => {
          if (!formData.batchId) throw new Error('Select a batch');
          await bulkTransfer(selectedIds, formData.batchId, formData.teacherId || undefined);
          onComplete?.();
        }}
      >
        <label className="form-label">Target Batch</label>
        <select className="form-select" value={formData.batchId || ''} onChange={e => setFormData({ ...formData, batchId: e.target.value })}>
          <option value="">Select batch...</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {teachers.length > 0 && (
          <>
            <label className="form-label" style={{ marginTop: '0.5rem' }}>Teacher (optional)</label>
            <select className="form-select" value={formData.teacherId || ''} onChange={e => setFormData({ ...formData, teacherId: e.target.value })}>
              <option value="">Keep current / none</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        )}
      </BulkActionDialog>

      <BulkActionDialog
        open={dialog === 'teacher'}
        onClose={closeDialog}
        action="Assign Teacher"
        selectedCount={selectedIds.length}
        onConfirm={async () => {
          if (!formData.teacherId) throw new Error('Select a teacher');
          await bulkAssignTeacher(selectedIds, formData.teacherId);
          onComplete?.();
        }}
      >
        <label className="form-label">Teacher</label>
        <select className="form-select" value={formData.teacherId || ''} onChange={e => setFormData({ ...formData, teacherId: e.target.value })}>
          <option value="">Select teacher...</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </BulkActionDialog>

      <BulkActionDialog
        open={dialog === 'fees'}
        onClose={closeDialog}
        action="Update Fees"
        selectedCount={selectedIds.length}
        onConfirm={async () => {
          const fees = {};
          if (formData.totalFee) fees.totalFeeAmount = parseFloat(formData.totalFee);
          if (formData.admissionFee) fees.admissionFeeAmount = parseFloat(formData.admissionFee);
          if (formData.concession) fees.feeConcessionAmount = parseFloat(formData.concession);
          if (!Object.keys(fees).length) throw new Error('Enter at least one fee value');
          await bulkFeeUpdate(selectedIds, fees);
          onComplete?.();
        }}
      >
        <label className="form-label">Total Fee</label>
        <input className="form-input" type="number" placeholder="Leave empty to skip" value={formData.totalFee || ''} onChange={e => setFormData({ ...formData, totalFee: e.target.value })} />
        <label className="form-label" style={{ marginTop: '0.5rem' }}>Admission Fee</label>
        <input className="form-input" type="number" placeholder="Leave empty to skip" value={formData.admissionFee || ''} onChange={e => setFormData({ ...formData, admissionFee: e.target.value })} />
        <label className="form-label" style={{ marginTop: '0.5rem' }}>Concession Amount</label>
        <input className="form-input" type="number" placeholder="Leave empty to skip" value={formData.concession || ''} onChange={e => setFormData({ ...formData, concession: e.target.value })} />
      </BulkActionDialog>
    </>
  );
}

/* ─── ApprovalQueueWidget ─────────────────────────────────── */
export function ApprovalQueueWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getApprovalQueue()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="approval-queue-widget skeleton-pulse" style={{ height: 120 }} />;
  if (!data) return null;

  const totalPending = (data.exams?.pending || 0) + (data.competitions?.pending || 0);
  const totalOverdue = (data.exams?.overdue || 0) + (data.competitions?.overdue || 0);

  if (totalPending === 0) return null;

  return (
    <div className="approval-queue-widget">
      <div className="approval-queue-widget__header">
        <h4>📋 Pending Approvals</h4>
        {totalOverdue > 0 && (
          <span className="approval-queue-widget__overdue-badge">{totalOverdue} overdue</span>
        )}
      </div>

      <div className="approval-queue-widget__grid">
        {data.exams?.pending > 0 && (
          <div className="approval-queue-card">
            <div className="approval-queue-card__title">Exam Enrollments</div>
            <div className="approval-queue-card__count">{data.exams.pending}</div>
            {data.exams.overdue > 0 && <div className="approval-queue-card__overdue">{data.exams.overdue} past SLA</div>}
            <div className="approval-queue-card__items">
              {data.exams.items.slice(0, 3).map(item => (
                <div key={item.id} className={`approval-queue-item ${item.overdue ? 'approval-queue-item--overdue' : ''}`}>
                  <span className="approval-queue-item__name">{item.cycleName || 'Enrollment List'}</span>
                  <span className="approval-queue-item__center">{item.centerName}</span>
                  <span className="approval-queue-item__sla">{item.hoursWaiting}h / {item.slaHours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.competitions?.pending > 0 && (
          <div className="approval-queue-card">
            <div className="approval-queue-card__title">Competitions</div>
            <div className="approval-queue-card__count">{data.competitions.pending}</div>
            {data.competitions.overdue > 0 && <div className="approval-queue-card__overdue">{data.competitions.overdue} past SLA</div>}
            <div className="approval-queue-card__items">
              {data.competitions.items.slice(0, 3).map(item => (
                <div key={item.id} className={`approval-queue-item ${item.overdue ? 'approval-queue-item--overdue' : ''}`}>
                  <span className="approval-queue-item__name">{item.name}</span>
                  <span className="approval-queue-item__center">{item.centerName}</span>
                  <span className="approval-queue-item__sla">{item.hoursWaiting}h / {item.slaHours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
