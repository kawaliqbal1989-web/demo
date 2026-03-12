import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  createStudentInstallment,
  deleteStudentInstallment,
  getStudentFeesContext,
  recordStudentPayment,
  updateStudent
} from "../../services/studentsService";
import { listLevels } from "../../services/levelsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { FEE_SCHEDULE_OPTIONS, formatFeeScheduleLabel } from "../../utils/feeSchedules.js";

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(2);
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function normalizeEditableMoney(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return NaN;
  return Number(num.toFixed(2));
}

function parseAdjustmentReference(reference) {
  const text = String(reference || "").trim();
  if (!text) return null;
  let match = text.match(/TOTAL_FEE_ADJUSTMENT\s+from\s+([^\s]+)\s+to\s+([^|\s]+)/i);
  if (!match) {
    // Legacy formatted references used in older UI rows.
    match = text.match(/Total\s+Fee\s+updated\s+([^\s]+)\s*->\s*([^\s]+)/i);
  }
  if (!match) return null;
  const fromValue = match[1] === "(not-set)" ? null : Number(match[1]);
  const toValue = Number(match[2]);
  return {
    from: Number.isFinite(fromValue) ? fromValue : null,
    to: Number.isFinite(toValue) ? toValue : null
  };
}

function computeTuitionFee(totalFee, admissionFee) {
  if (totalFee === null || totalFee === undefined) return null;
  const total = Number(totalFee);
  if (!Number.isFinite(total)) return null;
  const admission = admissionFee === null || admissionFee === undefined ? 0 : Number(admissionFee);
  if (!Number.isFinite(admission)) return null;
  return Math.max(0, Number((total - admission).toFixed(2)));
}

function CenterStudentFeesPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);

  const [levels, setLevels] = useState([]);

  const [studentTotalFeeAmount, setStudentTotalFeeAmount] = useState("");
  const [studentAdmissionFeeAmount, setStudentAdmissionFeeAmount] = useState("");
  const [feeChangeNote, setFeeChangeNote] = useState("");
  const [savingFeeConfig, setSavingFeeConfig] = useState(false);
  const [feeConfigError, setFeeConfigError] = useState("");
  const [feeConfigInfo, setFeeConfigInfo] = useState("");

  const [instAmount, setInstAmount] = useState("");
  const [instDueDate, setInstDueDate] = useState("");
  const [instSaving, setInstSaving] = useState(false);
  const [instError, setInstError] = useState("");

  const [paymentType, setPaymentType] = useState("ENROLLMENT");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [receivedAt, setReceivedAt] = useState("");
  const [feeScheduleType, setFeeScheduleType] = useState("ADVANCE");
  const [feeMonth, setFeeMonth] = useState("");
  const [feeYear, setFeeYear] = useState("");
  const [feeLevelId, setFeeLevelId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentInfo, setPaymentInfo] = useState("");

  const load = async () => {
    if (!studentId) return;

    setLoading(true);
    setError("");
    try {
      const [ctx, levelsRes] = await Promise.all([getStudentFeesContext(studentId), listLevels()]);
      const payload = ctx?.data || null;
      setContext(payload);
      setLevels(levelsRes?.data?.items || levelsRes?.data || []);

      setStudentTotalFeeAmount(payload?.student?.totalFeeAmount != null ? String(payload.student.totalFeeAmount) : "");
      setStudentAdmissionFeeAmount(payload?.student?.admissionFeeAmount != null ? String(payload.student.admissionFeeAmount) : "");
      setFeeChangeNote("");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load fees context.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const installmentOptions = useMemo(() => {
    const items = context?.installments || [];
    return items.map((inst) => {
      const label = `Due ${formatDate(inst.dueDate)} | Amount ${formatMoney(inst.amount)} | Pending ${formatMoney(inst.pending)} | ${inst.status}`;
      return { id: inst.id, label };
    });
  }, [context]);

  const onSaveConcession = async (e) => {
    e.preventDefault();
    if (!studentId) return;

    const nextTotalFeeAmount = normalizeEditableMoney(studentTotalFeeAmount);
    const nextAdmissionFeeAmount = normalizeEditableMoney(studentAdmissionFeeAmount);
    if (Number.isNaN(nextTotalFeeAmount) || Number.isNaN(nextAdmissionFeeAmount)) {
      setFeeConfigError("Fee amounts must be non-negative numbers.");
      setFeeConfigInfo("");
      return;
    }

    if (nextAdmissionFeeAmount != null && nextTotalFeeAmount == null) {
      setFeeConfigError("Set Total Fee when Admission Fee is provided.");
      setFeeConfigInfo("");
      return;
    }

    if (
      nextAdmissionFeeAmount != null &&
      nextTotalFeeAmount != null &&
      nextAdmissionFeeAmount > nextTotalFeeAmount
    ) {
      setFeeConfigError("Admission Fee must be less than or equal to Total Fee (it is included in total).");
      setFeeConfigInfo("");
      return;
    }

    const currentTotalFeeAmount = context?.student?.totalFeeAmount == null ? null : Number(Number(context.student.totalFeeAmount).toFixed(2));
    const currentAdmissionFeeAmount = context?.student?.admissionFeeAmount == null ? null : Number(Number(context.student.admissionFeeAmount).toFixed(2));
    const hasTotalFeeChanged = nextTotalFeeAmount !== currentTotalFeeAmount;
    const hasAdmissionFeeChanged = nextAdmissionFeeAmount !== currentAdmissionFeeAmount;
    const noteText = feeChangeNote.trim();

    if (!hasTotalFeeChanged && !hasAdmissionFeeChanged) {
      setFeeConfigError("");
      setFeeConfigInfo("No fee changes to save.");
      return;
    }

    if (!noteText) {
      setFeeConfigError("Fee Change Note is required when changing student fees.");
      setFeeConfigInfo("");
      return;
    }

    setSavingFeeConfig(true);
    setFeeConfigError("");
    setFeeConfigInfo("");
    try {
      const payload = {
        feeChangeNote: noteText
      };
      if (hasTotalFeeChanged) {
        payload.totalFeeAmount = nextTotalFeeAmount;
      }
      if (hasAdmissionFeeChanged) {
        payload.admissionFeeAmount = nextAdmissionFeeAmount;
      }

      await updateStudent(studentId, payload);
      setFeeConfigInfo("Student fee updated.");
      setFeeChangeNote("");
      await load();
    } catch (err) {
      setFeeConfigError(getFriendlyErrorMessage(err) || "Failed to save student fee.");
    } finally {
      setSavingFeeConfig(false);
    }
  };

  const onAddInstallment = async (e) => {
    e.preventDefault();
    if (!studentId) return;

    setInstSaving(true);
    setInstError("");
    try {
      await createStudentInstallment(studentId, {
        amount: Number(instAmount),
        dueDate: instDueDate
      });
      setInstAmount("");
      setInstDueDate("");
      await load();
    } catch (err) {
      setInstError(getFriendlyErrorMessage(err) || "Failed to create installment.");
    } finally {
      setInstSaving(false);
    }
  };

  const [deleteInstTarget, setDeleteInstTarget] = useState(null);

  const onDeleteInstallment = async () => {
    const id = deleteInstTarget;
    setDeleteInstTarget(null);
    if (!studentId || !id) return;

    setInstSaving(true);
    setInstError("");
    try {
      await deleteStudentInstallment(studentId, id);
      if (installmentId === id) setInstallmentId("");
      await load();
    } catch (err) {
      setInstError(getFriendlyErrorMessage(err) || "Failed to delete installment.");
    } finally {
      setInstSaving(false);
    }
  };

  const onRecordPayment = async (e) => {
    e.preventDefault();
    if (!studentId) return;

    setPaymentSaving(true);
    setPaymentError("");
    setPaymentInfo("");

    try {
      await recordStudentPayment(studentId, {
        type: paymentType,
        grossAmount: Number(paymentAmount),
        paymentMode,
        receivedAt: receivedAt || undefined,
        feeScheduleType,
        feeMonth: feeScheduleType === "MONTHLY" ? feeMonth : undefined,
        feeYear: feeScheduleType === "MONTHLY" ? feeYear : undefined,
        feeLevelId: feeScheduleType === "LEVEL_WISE" ? feeLevelId : undefined,
        paymentReference: paymentReference || undefined,
        installmentId: installmentId || undefined
      });

      setPaymentInfo("Payment recorded.");
      setPaymentAmount("");
      setPaymentType("ENROLLMENT");
      setPaymentMode("CASH");
      setReceivedAt("");
      setFeeScheduleType("ADVANCE");
      setFeeMonth("");
      setFeeYear("");
      setFeeLevelId("");
      setPaymentReference("");
      setInstallmentId("");

      await load();
    } catch (err) {
      setPaymentError(getFriendlyErrorMessage(err) || "Failed to record payment.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const studentLabel = context?.student?.fullName
    ? `${context.student.fullName} (${context.student.admissionNo || ""})`.trim()
    : context?.student?.admissionNo || "Student Fees";
  const summaryTuitionFee = computeTuitionFee(context?.summary?.totalFee, context?.student?.admissionFeeAmount);
  const editTuitionFee = computeTuitionFee(
    normalizeEditableMoney(studentTotalFeeAmount),
    normalizeEditableMoney(studentAdmissionFeeAmount)
  );

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Fees</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{studentLabel}</div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/center/students">
          Back to Students
        </Link>
      </div>

      {loading ? <p style={{ margin: 0 }}>Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {context ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="card" style={{ display: "grid", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Fee (incl. Admission)</div>
                <div style={{ fontWeight: 800 }}>{context.summary?.totalFee == null ? "(not set)" : formatMoney(context.summary.totalFee)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Admission Fee (included)</div>
                <div style={{ fontWeight: 800 }}>
                  {context?.student?.admissionFeeAmount == null ? "(not set)" : formatMoney(context.student.admissionFeeAmount)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Tuition Fee (excl. Admission)</div>
                <div style={{ fontWeight: 800 }}>
                  {summaryTuitionFee == null ? "(not set)" : formatMoney(summaryTuitionFee)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Paid</div>
                <div style={{ fontWeight: 800 }}>{formatMoney(context.summary?.paid)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pending</div>
                <div style={{ fontWeight: 800 }}>
                  {context.summary?.pending == null ? "(not set)" : formatMoney(context.summary.pending)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</div>
                <div style={{ fontWeight: 800 }}>{context.summary?.status || ""}</div>
              </div>
            </div>
          </div>

          <form className="card" onSubmit={onSaveConcession} style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Student Fee</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              This page applies only to this student. Admission Fee is part of Total Fee (not additional). Add a note explaining the change.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label>
                Total Fee
                <input className="input" inputMode="decimal" value={studentTotalFeeAmount} onChange={(e) => setStudentTotalFeeAmount(e.target.value)} placeholder="e.g. 15000" />
              </label>
              <label>
                Admission Fee
                <input className="input" inputMode="decimal" value={studentAdmissionFeeAmount} onChange={(e) => setStudentAdmissionFeeAmount(e.target.value)} placeholder="e.g. 2000" />
              </label>
              <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
                Tuition Fee (excluding admission): {editTuitionFee == null ? "(set total fee first)" : formatMoney(editTuitionFee)}
              </div>
              <label style={{ gridColumn: "1 / -1" }}>
                Fee Change Note
                <textarea className="input" rows={3} value={feeChangeNote} onChange={(e) => setFeeChangeNote(e.target.value)} placeholder="Explain why this student's fee is being set or changed." required />
              </label>
            </div>

            <div>
              <button className="button secondary" disabled={savingFeeConfig}>
                {savingFeeConfig ? "Saving..." : "Save Student Fee"}
              </button>
            </div>
          </form>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Installments</h3>
            {instError ? <p className="error">{instError}</p> : null}

            <form onSubmit={onAddInstallment} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label>
                  Amount
                  <input
                    className="input"
                    inputMode="decimal"
                    value={instAmount}
                    onChange={(e) => setInstAmount(e.target.value)}
                    placeholder="e.g. 3000"
                    required
                  />
                </label>
                <label>
                  Due Date
                  <input className="input" type="date" value={instDueDate} onChange={(e) => setInstDueDate(e.target.value)} required />
                </label>
              </div>
              <div>
                <button className="button secondary" disabled={instSaving}>
                  {instSaving ? "Saving..." : "Add Installment"}
                </button>
              </div>
            </form>

            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Pending</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(context.installments || []).length ? (
                    (context.installments || []).map((inst) => (
                      <tr key={inst.id}>
                        <td>{formatDate(inst.dueDate)}</td>
                        <td>{formatMoney(inst.amount)}</td>
                        <td>{formatMoney(inst.paid)}</td>
                        <td>{formatMoney(inst.pending)}</td>
                        <td>{inst.status}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="button secondary"
                            style={{ width: "auto" }}
                            disabled={instSaving}
                            onClick={() => setDeleteInstTarget(inst.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--color-text-muted)" }}>
                        No installments yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <form className="card" onSubmit={onRecordPayment} style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Record Payment</h3>
            {paymentError ? <p className="error">{paymentError}</p> : null}
            {paymentInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{paymentInfo}</p> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label>
                Type
                <select className="select" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                  <option value="ENROLLMENT">ENROLLMENT</option>
                  <option value="RENEWAL">RENEWAL</option>
                  <option value="ADJUSTMENT">ADJUSTMENT (set discounted total fee)</option>
                </select>
              </label>

              {paymentType === "ADJUSTMENT" ? (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
                  Adjustment updates the student final total fee after discount (for example, 2500 adjusted to 1500).
                </div>
              ) : null}

              {paymentType === "ADJUSTMENT" ? (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
                  This is a non-cash update event. It changes Total Fee but does not increase cash collected.
                </div>
              ) : null}

              <label>
                {paymentType === "ADJUSTMENT" ? "Final Total Fee" : "Amount"}
                <input
                  className="input"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  required
                />
              </label>

              <label>
                Payment Mode
                <select className="select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="CASH">CASH</option>
                  <option value="ONLINE">ONLINE</option>
                  <option value="GPAY">GPAY</option>
                  <option value="PAYTM">PAYTM</option>
                  <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                </select>
              </label>

              <label>
                Received Date
                <input className="input" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
              </label>

              <label>
                Schedule Type
                <select className="select" value={feeScheduleType} onChange={(e) => setFeeScheduleType(e.target.value)}>
                  {FEE_SCHEDULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              {feeScheduleType === "MONTHLY" ? (
                <>
                  <label>
                    Month
                    <input className="input" value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)} placeholder="1-12" />
                  </label>
                  <label>
                    Year
                    <input className="input" value={feeYear} onChange={(e) => setFeeYear(e.target.value)} placeholder="2026" />
                  </label>
                </>
              ) : null}

              {feeScheduleType === "LEVEL_WISE" ? (
                <label>
                  Level
                  <select className="select" value={feeLevelId} onChange={(e) => setFeeLevelId(e.target.value)}>
                    <option value="">Select level</option>
                    {levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} / {l.rank}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                Payment Reference
                <input className="input" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="UTR / txn id" />
              </label>

              <label>
                Allocate to Installment (optional)
                <select className="select" value={installmentId} onChange={(e) => setInstallmentId(e.target.value)}>
                  <option value="">Unallocated</option>
                  {installmentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <button className="button" disabled={paymentSaving}>
                {paymentSaving ? "Saving..." : "Record Payment"}
              </button>
            </div>
          </form>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Payments</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Schedule</th>
                    <th>Level</th>
                    <th>Installment</th>
                    <th>Reference</th>
                    <th>Paid By</th>
                  </tr>
                </thead>
                <tbody>
                  {(context.payments || []).length ? (
                    (context.payments || []).map((p) => {
                      const isAdjustment = p.type === "ADJUSTMENT";
                      const adjustmentMeta = isAdjustment ? parseAdjustmentReference(p.paymentReference) : null;
                      const legacyAdjustmentAmount = Number(p.grossAmount || 0);
                      const displayAmount = isAdjustment
                        ? (adjustmentMeta?.to != null
                          ? adjustmentMeta.to
                          : (Number.isFinite(legacyAdjustmentAmount) && legacyAdjustmentAmount > 0 ? legacyAdjustmentAmount : null))
                        : Number(p.grossAmount || 0);
                      const adjustmentReferenceText = adjustmentMeta
                        ? `Total Fee updated${adjustmentMeta.from != null ? ` ${formatMoney(adjustmentMeta.from)} -> ` : " to "}${adjustmentMeta.to != null ? formatMoney(adjustmentMeta.to) : ""}`
                        : (Number.isFinite(legacyAdjustmentAmount) && legacyAdjustmentAmount > 0
                          ? `Total Fee adjusted to ${formatMoney(legacyAdjustmentAmount)} (legacy)`
                          : (p.paymentReference || "Total Fee adjusted"));

                      return (
                      <tr key={p.id}>
                        <td>{formatDate(p.receivedAt || p.createdAt)}</td>
                        <td>{isAdjustment ? "ADJUSTMENT (non-cash)" : p.type}</td>
                        <td>{displayAmount == null ? "—" : formatMoney(displayAmount)}</td>
                        <td>{isAdjustment ? "—" : (p.paymentMode || "")}</td>
                        <td>
                          {isAdjustment ? "TOTAL_FEE" : formatFeeScheduleLabel(p.feeScheduleType, p.feeMonth, p.feeYear)}
                        </td>
                        <td>{isAdjustment ? "—" : (p.feeLevel ? `${p.feeLevel.name} / ${p.feeLevel.rank}` : "")}</td>
                        <td>{isAdjustment ? "—" : (p.installment ? `${formatDate(p.installment.dueDate)} (${formatMoney(p.installment.amount)})` : "")}</td>
                        <td>
                          {isAdjustment
                            ? adjustmentReferenceText
                            : (p.paymentReference || "")}
                        </td>
                        <td>{p.createdBy?.username || p.createdBy?.email || ""}</td>
                      </tr>
                    );})
                  ) : (
                    <tr>
                      <td colSpan={9} style={{ color: "var(--color-text-muted)" }}>
                        No payments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!deleteInstTarget}
        title="Delete Installment"
        message="Delete this installment? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onDeleteInstallment}
        onCancel={() => setDeleteInstTarget(null)}
      />
    </section>
  );
}

export { CenterStudentFeesPage };
