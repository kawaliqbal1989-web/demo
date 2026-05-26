import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  cancelStudentReceipt,
  collectStudentPaymentReceipt,
  createStudentFeeMonthAdjustment,
  createStudentInstallment,
  deleteStudentInstallment,
  downloadStudentReceiptPdf,
  getStudentFeesContext,
  listStudentReceipts,
  previewStudentReceiptAllocation,
  recordStudentPayment,
  refundStudentReceipt,
  updateStudent
} from "../../services/studentsService";
import { listLevels } from "../../services/levelsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { FEE_SCHEDULE_OPTIONS, formatFeeScheduleLabel } from "../../utils/feeSchedules.js";

const MONTH_OPTIONS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" }
];

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
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

function formatMonthYear(month, year) {
  const monthNum = Number(month);
  const yearNum = Number(year);
  if (!Number.isInteger(monthNum) || !Number.isInteger(yearNum)) return "";
  const label = MONTH_OPTIONS.find((item) => item.value === monthNum)?.label || String(monthNum);
  return `${label} ${yearNum}`;
}

function getDueStatusBadgeClass(status) {
  switch (String(status || "").toUpperCase()) {
    case "PAID":
      return "badge badge-success";
    case "PARTIAL":
      return "badge badge-warning";
    case "OVERDUE":
      return "badge badge-danger";
    case "WAIVED":
      return "badge badge-success";
    case "PAUSED":
      return "badge badge-warning";
    case "PENDING":
      return "badge badge-secondary";
    default:
      return "badge badge-secondary";
  }
}

function getAdjustmentBadgeClass(type) {
  switch (String(type || "").toUpperCase()) {
    case "WAIVED":
      return "badge badge-success";
    case "PAUSED":
      return "badge badge-warning";
    default:
      return "badge badge-secondary";
  }
}

function getReceiptStatusBadgeClass(status) {
  switch (String(status || "").toUpperCase()) {
    case "ACTIVE":
      return "badge badge-success";
    case "PARTIALLY_REFUNDED":
      return "badge badge-warning";
    case "REFUNDED":
      return "badge badge-secondary";
    case "CANCELLED":
      return "badge badge-danger";
    default:
      return "badge badge-secondary";
  }
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
  const [instRecurringMonthly, setInstRecurringMonthly] = useState(false);
  const [instRecurrenceEndDate, setInstRecurrenceEndDate] = useState("");
  const [instSaving, setInstSaving] = useState(false);
  const [instError, setInstError] = useState("");
  const [instInfo, setInstInfo] = useState("");
  const [deleteInstTarget, setDeleteInstTarget] = useState(null);

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

  const [receipts, setReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");

  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectPaymentMode, setCollectPaymentMode] = useState("CASH");
  const [collectPaymentType, setCollectPaymentType] = useState("RENEWAL");
  const [collectDate, setCollectDate] = useState("");
  const [collectReferenceNumber, setCollectReferenceNumber] = useState("");
  const [collectTransactionId, setCollectTransactionId] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectSaving, setCollectSaving] = useState(false);
  const [allocationPreview, setAllocationPreview] = useState(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [collectError, setCollectError] = useState("");

  const initialMonth = String(new Date().getMonth() + 1);
  const initialYear = String(new Date().getFullYear());
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustType, setAdjustType] = useState("WAIVED");
  const [adjustMonth, setAdjustMonth] = useState(initialMonth);
  const [adjustYear, setAdjustYear] = useState(initialYear);
  const [adjustRemarks, setAdjustRemarks] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [adjustInfo, setAdjustInfo] = useState("");

  const load = async () => {
    if (!studentId) return;

    setLoading(true);
    setError("");
    try {
      const [ctx, levelsRes, receiptsRes] = await Promise.all([
        getStudentFeesContext(studentId),
        listLevels(),
        listStudentReceipts(studentId, { limit: 100, offset: 0 })
      ]);
      const payload = ctx?.data || null;
      setContext(payload);
      setLevels(levelsRes?.data?.items || levelsRes?.data || []);
      setReceipts(receiptsRes?.data?.items || receiptsRes?.items || []);
      setReceiptError("");

      setStudentTotalFeeAmount(payload?.student?.totalFeeAmount != null ? String(payload.student.totalFeeAmount) : "");
      setStudentAdmissionFeeAmount(payload?.student?.admissionFeeAmount != null ? String(payload.student.admissionFeeAmount) : "");
      setFeeChangeNote("");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load fees context.");
      setReceiptError(getFriendlyErrorMessage(err) || "Failed to load receipts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const dueRows = useMemo(() => context?.installments || [], [context]);

  const templatePendingById = useMemo(() => {
    const map = new Map();
    for (const dueRow of dueRows) {
      const sourceInstallmentId = dueRow.sourceInstallmentId || dueRow.id;
      const prev = Number(map.get(sourceInstallmentId) || 0);
      map.set(sourceInstallmentId, Number((prev + Number(dueRow.pending || 0)).toFixed(2)));
    }
    return map;
  }, [dueRows]);

  const installmentOptions = useMemo(() => {
    const templates = (context?.installmentTemplates || []).filter((item) => !item.isRecurringMonthly);
    return templates.map((inst) => {
      const pending = Number(templatePendingById.get(inst.id) || 0);
      const label = `Due ${formatDate(inst.dueDate)} | Amount ${formatMoney(inst.amount)} | Pending ${formatMoney(pending)}`;
      return { id: inst.id, label };
    });
  }, [context, templatePendingById]);

  const recurringTemplateCount = useMemo(() => {
    return (context?.installmentTemplates || []).filter((item) => item.isRecurringMonthly).length;
  }, [context]);

  const templateRows = useMemo(() => context?.installmentTemplates || [], [context]);
  const monthAdjustments = useMemo(() => context?.monthAdjustments || [], [context]);

  const refreshReceipts = async () => {
    if (!studentId) return;
    setReceiptsLoading(true);
    setReceiptError("");
    try {
      const receiptsRes = await listStudentReceipts(studentId, { limit: 100, offset: 0 });
      setReceipts(receiptsRes?.data?.items || receiptsRes?.items || []);
    } catch (err) {
      setReceiptError(getFriendlyErrorMessage(err) || "Failed to load receipts.");
    } finally {
      setReceiptsLoading(false);
    }
  };

  const openCollectModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setCollectModalOpen(true);
    setCollectAmount("");
    setCollectPaymentMode("CASH");
    setCollectPaymentType("RENEWAL");
    setCollectDate(today);
    setCollectReferenceNumber("");
    setCollectTransactionId("");
    setCollectNotes("");
    setAllocationPreview(null);
    setCollectError("");
  };

  const closeCollectModal = () => {
    if (collectSaving) return;
    setCollectModalOpen(false);
  };

  const onPreviewAllocation = async () => {
    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCollectError("Enter a valid payment amount before preview.");
      return;
    }

    setAllocationLoading(true);
    setCollectError("");
    try {
      const response = await previewStudentReceiptAllocation(studentId, { amount });
      setAllocationPreview(response?.data || response || null);
    } catch (err) {
      setCollectError(getFriendlyErrorMessage(err) || "Failed to preview allocation.");
    } finally {
      setAllocationLoading(false);
    }
  };

  const onCollectReceipt = async (event) => {
    event.preventDefault();
    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCollectError("Amount must be greater than 0.");
      return;
    }

    setCollectSaving(true);
    setCollectError("");
    try {
      await collectStudentPaymentReceipt(studentId, {
        paymentType: collectPaymentType,
        amount,
        paymentMode: collectPaymentMode,
        collectedAt: collectDate || undefined,
        referenceNumber: collectReferenceNumber || undefined,
        transactionId: collectTransactionId || undefined,
        notes: collectNotes || undefined
      });
      setCollectModalOpen(false);
      await Promise.all([load(), refreshReceipts()]);
    } catch (err) {
      setCollectError(getFriendlyErrorMessage(err) || "Failed to collect payment.");
    } finally {
      setCollectSaving(false);
    }
  };

  const onDownloadReceipt = async (receiptId) => {
    try {
      await downloadStudentReceiptPdf(studentId, receiptId);
    } catch (err) {
      setReceiptError(getFriendlyErrorMessage(err) || "Failed to download receipt PDF.");
    }
  };

  const onRefundReceipt = async (receipt) => {
    const amountText = window.prompt(`Refund amount for ${receipt.receiptNumber}`, "");
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      setReceiptError("Refund amount must be greater than 0.");
      return;
    }
    const reason = window.prompt("Refund reason", "Refund initiated") || "Refund initiated";

    try {
      await refundStudentReceipt(studentId, receipt.id, {
        amount,
        paymentMode: "CASH",
        reason,
        referenceNumber: `RF-${Date.now()}`
      });
      await Promise.all([load(), refreshReceipts()]);
    } catch (err) {
      setReceiptError(getFriendlyErrorMessage(err) || "Failed to refund receipt.");
    }
  };

  const onCancelReceipt = async (receipt) => {
    const reason = window.prompt(`Cancel reason for ${receipt.receiptNumber}`, "Receipt cancelled") || "Receipt cancelled";
    try {
      await cancelStudentReceipt(studentId, receipt.id, { reason, paymentMode: "CASH" });
      await Promise.all([load(), refreshReceipts()]);
    } catch (err) {
      setReceiptError(getFriendlyErrorMessage(err) || "Failed to cancel receipt.");
    }
  };

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

    const amount = Number(instAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setInstError("Installment amount must be greater than 0.");
      setInstInfo("");
      return;
    }

    if (!instDueDate) {
      setInstError("Due date is required.");
      setInstInfo("");
      return;
    }

    if (instRecurringMonthly && instRecurrenceEndDate && instRecurrenceEndDate < instDueDate) {
      setInstError("Recurrence end date must be on or after due date.");
      setInstInfo("");
      return;
    }

    setInstSaving(true);
    setInstError("");
    setInstInfo("");
    try {
      await createStudentInstallment(studentId, {
        amount,
        dueDate: instDueDate,
        isRecurringMonthly: instRecurringMonthly,
        recurrenceEndDate: instRecurringMonthly ? (instRecurrenceEndDate || undefined) : undefined
      });
      setInstAmount("");
      setInstDueDate("");
      setInstRecurringMonthly(false);
      setInstRecurrenceEndDate("");
      setInstInfo(instRecurringMonthly ? "Recurring monthly template created." : "One-time installment created.");
      await load();
    } catch (err) {
      setInstError(getFriendlyErrorMessage(err) || "Failed to create installment.");
    } finally {
      setInstSaving(false);
    }
  };

  const onDeleteInstallment = async () => {
    const id = deleteInstTarget;
    setDeleteInstTarget(null);
    if (!studentId || !id) return;

    setInstSaving(true);
    setInstError("");
    setInstInfo("");
    try {
      await deleteStudentInstallment(studentId, id);
      if (installmentId === id) setInstallmentId("");
      setInstInfo("Installment template deleted.");
      await load();
    } catch (err) {
      setInstError(getFriendlyErrorMessage(err) || "Failed to delete installment.");
    } finally {
      setInstSaving(false);
    }
  };

  const openAdjustmentModal = () => {
    const now = new Date();
    setAdjustType("WAIVED");
    setAdjustMonth(String(now.getMonth() + 1));
    setAdjustYear(String(now.getFullYear()));
    setAdjustRemarks("");
    setAdjustError("");
    setAdjustModalOpen(true);
  };

  const closeAdjustmentModal = () => {
    if (adjustSaving) return;
    setAdjustModalOpen(false);
  };

  const onCreateMonthAdjustment = async (event) => {
    event.preventDefault();
    if (!studentId) return;

    const month = Number(adjustMonth);
    const year = Number(adjustYear);
    const remarks = adjustRemarks.trim();

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      setAdjustError("Month must be between 1 and 12.");
      return;
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setAdjustError("Year must be between 2000 and 2100.");
      return;
    }

    if (!remarks) {
      setAdjustError("Remarks are required.");
      return;
    }

    setAdjustSaving(true);
    setAdjustError("");
    setAdjustInfo("");
    try {
      await createStudentFeeMonthAdjustment(studentId, {
        actionType: adjustType,
        month,
        year,
        remarks
      });

      setAdjustInfo(`${adjustType === "WAIVED" ? "Waiver" : "Pause"} added for ${formatMonthYear(month, year)}.`);
      setAdjustModalOpen(false);
      await load();
    } catch (err) {
      setAdjustError(getFriendlyErrorMessage(err) || "Failed to add month adjustment.");
    } finally {
      setAdjustSaving(false);
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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Due</div>
                <div style={{ fontWeight: 800 }}>{formatMoney(context.summary?.dueTotal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Paid</div>
                <div style={{ fontWeight: 800 }}>{formatMoney(context.summary?.paid)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pending</div>
                <div style={{ fontWeight: 800 }}>{formatMoney(context.summary?.pending)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Overdue</div>
                <div style={{ fontWeight: 800 }}>{formatMoney(context.summary?.overdue)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Waived Months</div>
                <div style={{ fontWeight: 800 }}>{context.summary?.waivedMonths || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Paused Months</div>
                <div style={{ fontWeight: 800 }}>{context.summary?.pausedMonths || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</div>
                <div style={{ fontWeight: 800 }}>
                  <span className={getDueStatusBadgeClass(context.summary?.status)}>{context.summary?.status || "NO_DUE"}</span>
                </div>
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
            {feeConfigError ? <p className="error" style={{ margin: 0 }}>{feeConfigError}</p> : null}
            {feeConfigInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{feeConfigInfo}</p> : null}
          </form>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Installment Templates</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {recurringTemplateCount > 0
                  ? `${recurringTemplateCount} recurring template(s) active`
                  : "No recurring template configured"}
              </div>
            </div>
            {instError ? <p className="error">{instError}</p> : null}
            {instInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{instInfo}</p> : null}

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
                <label style={{ alignSelf: "end", display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={instRecurringMonthly}
                    onChange={(e) => setInstRecurringMonthly(e.target.checked)}
                  />
                  Recurring Monthly Template
                </label>
                {instRecurringMonthly ? (
                  <label>
                    Recurrence End Date (optional)
                    <input
                      className="input"
                      type="date"
                      value={instRecurrenceEndDate}
                      onChange={(e) => setInstRecurrenceEndDate(e.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <div>
                <button className="button secondary" disabled={instSaving}>
                  {instSaving ? "Saving..." : "Save Installment Template"}
                </button>
              </div>
            </form>

            <div className="data-table-wrap" style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Recurrence</th>
                    <th style={{ textAlign: "right" }}>Pending</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {templateRows.length ? (
                    templateRows.map((inst) => (
                      <tr key={inst.id}>
                        <td>{inst.isRecurringMonthly ? "MONTHLY" : "ONE_TIME"}</td>
                        <td>{formatDate(inst.dueDate)}</td>
                        <td>{formatMoney(inst.amount)}</td>
                        <td>
                          {inst.isRecurringMonthly
                            ? (inst.recurrenceEndDate
                              ? `${formatDate(inst.dueDate)} to ${formatDate(inst.recurrenceEndDate)}`
                              : `From ${formatDate(inst.dueDate)} onward`)
                            : "-"}
                        </td>
                        <td style={{ textAlign: "right" }}>{formatMoney(templatePendingById.get(inst.id) || 0)}</td>
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
                      <td colSpan={6} className="data-table__empty">
                        No installment templates yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Monthly Waiver / Pause</h3>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Mark a monthly due as waived or paused with mandatory remarks. One action is allowed per month.
                </div>
              </div>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={openAdjustmentModal}>
                Add Waiver / Pause
              </button>
            </div>

            {adjustInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{adjustInfo}</p> : null}

            <div className="data-table-wrap" style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Action</th>
                    <th>Remarks</th>
                    <th>Created By</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {monthAdjustments.length ? (
                    monthAdjustments.map((item) => (
                      <tr key={item.id}>
                        <td>{formatMonthYear(item.month, item.year)}</td>
                        <td>
                          <span className={getAdjustmentBadgeClass(item.adjustmentType)}>{item.adjustmentType}</span>
                        </td>
                        <td style={{ minWidth: 220 }}>{item.remarks || ""}</td>
                        <td>{item.createdBy?.username || item.createdBy?.email || ""}</td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="data-table__empty">
                        No month waivers or pauses yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Due Timeline</h3>
            <div className="data-table-wrap" style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Due Date</th>
                    <th>Source</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th style={{ textAlign: "right" }}>Paid</th>
                    <th style={{ textAlign: "right" }}>Pending</th>
                    <th>Status</th>
                    <th>Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {dueRows.length ? (
                    dueRows.map((inst) => (
                      <tr key={inst.id}>
                        <td>{inst.month && inst.year ? formatMonthYear(inst.month, inst.year) : "-"}</td>
                        <td>{formatDate(inst.dueDate)}</td>
                        <td>{inst.isRecurringMonthly ? "Monthly recurring" : "One-time"}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(inst.amount)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(inst.paid)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(inst.pending)}</td>
                        <td><span className={getDueStatusBadgeClass(inst.status)}>{inst.status}</span></td>
                        <td>
                          {inst.adjustmentType
                            ? `${inst.adjustmentType}${inst.adjustmentRemarks ? `: ${inst.adjustmentRemarks}` : ""}`
                            : "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="data-table__empty">
                        No dues generated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Payment Receipts</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="button secondary" style={{ width: "auto" }} onClick={refreshReceipts} disabled={receiptsLoading}>
                  {receiptsLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button type="button" className="button" style={{ width: "auto" }} onClick={openCollectModal}>
                  Collect Payment
                </button>
              </div>
            </div>

            {receiptError ? <p className="error" style={{ margin: 0 }}>{receiptError}</p> : null}

            <div className="data-table-wrap" style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Receipt No</th>
                    <th>Date</th>
                    <th>Mode</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>Allocated</th>
                    <th style={{ textAlign: "right" }}>Unallocated</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.length ? (
                    receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td>{receipt.receiptNumber}</td>
                        <td>{formatDate(receipt.collectedAt)}</td>
                        <td>{receipt.paymentMode}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(receipt.totalAmount)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(receipt.allocatedAmount)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(receipt.unallocatedAmount)}</td>
                        <td><span className={getReceiptStatusBadgeClass(receipt.status)}>{receipt.status}</span></td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => onDownloadReceipt(receipt.id)}>PDF</button>
                            {receipt.status === "ACTIVE" || receipt.status === "PARTIALLY_REFUNDED" ? (
                              <>
                                <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => onRefundReceipt(receipt)}>Refund</button>
                                <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => onCancelReceipt(receipt)}>Cancel</button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="data-table__empty">
                        No receipts yet.
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
                    <input className="input" type="number" min={1} max={12} value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)} placeholder="1-12" />
                  </label>
                  <label>
                    Year
                    <input className="input" type="number" min={2000} max={2100} value={feeYear} onChange={(e) => setFeeYear(e.target.value)} placeholder="2026" />
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
            <div className="data-table-wrap" style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
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
                          <td style={{ textAlign: "right" }}>{displayAmount == null ? "—" : formatMoney(displayAmount)}</td>
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
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="data-table__empty">
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
        title="Delete Installment Template"
        message="Delete this installment template? Existing payment records stay as-is, but future dues from this template stop."
        confirmLabel="Delete"
        onConfirm={onDeleteInstallment}
        onCancel={() => setDeleteInstTarget(null)}
      />

      {collectModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 60
          }}
        >
          <form className="card" onSubmit={onCollectReceipt} style={{ width: "100%", maxWidth: 720, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Collect Payment</h3>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={closeCollectModal}>Close</button>
            </div>

            {collectError ? <p className="error" style={{ margin: 0 }}>{collectError}</p> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label>
                Amount
                <input className="input" inputMode="decimal" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} required />
              </label>
              <label>
                Payment Type
                <select className="select" value={collectPaymentType} onChange={(e) => setCollectPaymentType(e.target.value)}>
                  <option value="RENEWAL">RENEWAL</option>
                  <option value="ENROLLMENT">ENROLLMENT</option>
                </select>
              </label>
              <label>
                Payment Mode
                <select className="select" value={collectPaymentMode} onChange={(e) => setCollectPaymentMode(e.target.value)}>
                  <option value="CASH">CASH</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                  <option value="CARD">CARD</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="ONLINE_GATEWAY">ONLINE_GATEWAY</option>
                  <option value="ONLINE">ONLINE</option>
                  <option value="GPAY">GPAY</option>
                  <option value="PAYTM">PAYTM</option>
                </select>
              </label>
              <label>
                Collected Date
                <input className="input" type="date" value={collectDate} onChange={(e) => setCollectDate(e.target.value)} />
              </label>
              <label>
                Reference No
                <input className="input" value={collectReferenceNumber} onChange={(e) => setCollectReferenceNumber(e.target.value)} />
              </label>
              <label>
                Txn Id
                <input className="input" value={collectTransactionId} onChange={(e) => setCollectTransactionId(e.target.value)} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Notes
                <textarea className="input" rows={2} value={collectNotes} onChange={(e) => setCollectNotes(e.target.value)} />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onPreviewAllocation} disabled={allocationLoading || collectSaving}>
                {allocationLoading ? "Previewing..." : "Preview Allocation"}
              </button>
              <button type="submit" className="button" style={{ width: "auto" }} disabled={collectSaving}>
                {collectSaving ? "Collecting..." : "Collect & Generate Receipt"}
              </button>
            </div>

            {allocationPreview?.preview?.allocations?.length ? (
              <div className="data-table-wrap" style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Due Date</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Before</th>
                      <th style={{ textAlign: "right" }}>Allocated</th>
                      <th style={{ textAlign: "right" }}>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationPreview.preview.allocations.map((item, idx) => (
                      <tr key={`${item.allocationType}-${idx}`}>
                        <td>{item.dueDate ? formatDate(item.dueDate) : "-"}</td>
                        <td>{item.allocationType}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(item.duePendingBefore || 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(item.allocatedAmount || 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(item.duePendingAfter || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}

      {adjustModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50
          }}
        >
          <form className="card" onSubmit={onCreateMonthAdjustment} style={{ width: "100%", maxWidth: 520, display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>Add Month Waiver / Pause</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Use this only for approved exceptions. One action is allowed per month.
              </div>
            </div>

            {adjustError ? <p className="error" style={{ margin: 0 }}>{adjustError}</p> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <label>
                Action
                <select className="select" value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
                  <option value="WAIVED">WAIVED</option>
                  <option value="PAUSED">PAUSED</option>
                </select>
              </label>

              <label>
                Month
                <select className="select" value={adjustMonth} onChange={(e) => setAdjustMonth(e.target.value)}>
                  {MONTH_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Year
                <input
                  className="input"
                  type="number"
                  min={2000}
                  max={2100}
                  value={adjustYear}
                  onChange={(e) => setAdjustYear(e.target.value)}
                />
              </label>

              <label style={{ gridColumn: "1 / -1" }}>
                Remarks
                <textarea
                  className="input"
                  rows={3}
                  value={adjustRemarks}
                  onChange={(e) => setAdjustRemarks(e.target.value)}
                  placeholder="Reason and approval context"
                  required
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={closeAdjustmentModal}>
                Cancel
              </button>
              <button type="submit" className="button" style={{ width: "auto" }} disabled={adjustSaving}>
                {adjustSaving ? "Saving..." : "Save Action"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export { CenterStudentFeesPage };
