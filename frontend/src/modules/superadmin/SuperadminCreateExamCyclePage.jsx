import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listBusinessPartners } from "../../services/businessPartnersService";
import { createExamCycle } from "../../services/examCyclesService";

function toIsoOrNull(localDateTimeValue) {
  const text = String(localDateTimeValue || "").trim();
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseLocalDateTimeOrNull(localDateTimeValue) {
  const text = String(localDateTimeValue || "").trim();
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function validateOrder(a, b, message) {
  if (!a || !b) return null;
  return a.getTime() <= b.getTime() ? null : message;
}

function SuperadminCreateExamCyclePage() {
  const navigate = useNavigate();

  const [partners, setPartners] = useState([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [businessPartnerId, setBusinessPartnerId] = useState("");
  const [name, setName] = useState("");

  const [enrollmentStartAt, setEnrollmentStartAt] = useState("");
  const [enrollmentEndAt, setEnrollmentEndAt] = useState("");
  const [practiceStartAt, setPracticeStartAt] = useState("");
  const [examStartsAt, setExamStartsAt] = useState("");
  const [examEndsAt, setExamEndsAt] = useState("");
  const [examDurationMinutes, setExamDurationMinutes] = useState(45);
  const [resultPublishAt, setResultPublishAt] = useState("");

  const canSubmit = useMemo(() => {
    return Boolean(
      businessPartnerId &&
        name.trim() &&
        enrollmentStartAt &&
        enrollmentEndAt &&
        practiceStartAt &&
        examStartsAt &&
        examEndsAt &&
        Number(examDurationMinutes) > 0
    );
  }, [businessPartnerId, name, enrollmentStartAt, enrollmentEndAt, practiceStartAt, examStartsAt, examEndsAt, examDurationMinutes]);

  useEffect(() => {
    let cancelled = false;

    async function loadPartners() {
      setLoadingPartners(true);
      setError("");
      try {
        const data = await listBusinessPartners({ limit: 100, offset: 0 });
        if (cancelled) return;
        setPartners(data?.data?.items || []);
      } catch (err) {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load business partners.");
      } finally {
        if (!cancelled) {
          setLoadingPartners(false);
        }
      }
    }

    void loadPartners();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadingPartners && !partners.length) {
    return <LoadingState label="Loading business partners..." />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || submitting) {
      return;
    }

    // Client-side validation to prevent generic 400s.
    const enrollmentStartD = parseLocalDateTimeOrNull(enrollmentStartAt);
    const enrollmentEndD = parseLocalDateTimeOrNull(enrollmentEndAt);
    const practiceStartD = parseLocalDateTimeOrNull(practiceStartAt);
    const examStartD = parseLocalDateTimeOrNull(examStartsAt);
    const examEndD = parseLocalDateTimeOrNull(examEndsAt);

    if (!enrollmentStartD || !enrollmentEndD || !practiceStartD || !examStartD || !examEndD) {
      setError("Please fill all date/time fields.");
      return;
    }

    const e1 = validateOrder(enrollmentStartD, enrollmentEndD, "Enrollment start must be before enrollment end.");
    if (e1) {
      setError(e1);
      return;
    }

    const e2 = validateOrder(practiceStartD, examStartD, "Practice start must be before exam start.");
    if (e2) {
      setError(e2);
      return;
    }

    const e3 = validateOrder(examStartD, examEndD, "Exam start must be before exam end.");
    if (e3) {
      setError(e3);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        businessPartnerId,
        name: name.trim(),
        enrollmentStartAt: enrollmentStartD.toISOString(),
        enrollmentEndAt: enrollmentEndD.toISOString(),
        practiceStartAt: practiceStartD.toISOString(),
        examStartsAt: examStartD.toISOString(),
        examEndsAt: examEndD.toISOString(),
        examDurationMinutes: Number(examDurationMinutes),
        attemptLimit: 1,
        ...(toIsoOrNull(resultPublishAt) ? { resultPublishAt: toIsoOrNull(resultPublishAt) } : {})
      };

      const created = await createExamCycle(payload);
      toast.success(`Exam cycle created: ${created?.data?.code || ""}`);
      navigate("/superadmin/exam-cycles");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create exam cycle.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Create Exam Cycle</h2>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label>Business Partner</label>
          <select className="select" value={businessPartnerId} onChange={(e) => setBusinessPartnerId(e.target.value)}>
            <option value="">Select Business Partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Exam Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Abacus Level 1 Final" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Enrollment Start</label>
            <input className="input" type="datetime-local" value={enrollmentStartAt} onChange={(e) => setEnrollmentStartAt(e.target.value)} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Enrollment End</label>
            <input className="input" type="datetime-local" value={enrollmentEndAt} onChange={(e) => setEnrollmentEndAt(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Practice Start</label>
            <input className="input" type="datetime-local" value={practiceStartAt} onChange={(e) => setPracticeStartAt(e.target.value)} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Result Publish Date (optional)</label>
            <input className="input" type="datetime-local" value={resultPublishAt} onChange={(e) => setResultPublishAt(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Exam Starts</label>
            <input className="input" type="datetime-local" value={examStartsAt} onChange={(e) => setExamStartsAt(e.target.value)} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Exam Ends</label>
            <input className="input" type="datetime-local" value={examEndsAt} onChange={(e) => setExamEndsAt(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Exam Duration (minutes)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={600}
              value={examDurationMinutes}
              onChange={(e) => setExamDurationMinutes(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Attempt Limit</label>
            <input className="input" value="1 (fixed)" disabled />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="button" type="submit" disabled={!canSubmit || submitting} style={{ width: "auto" }}>
            {submitting ? "Creating..." : "Create"}
          </button>
          <button className="button secondary" type="button" onClick={() => navigate("/superadmin/exam-cycles")} style={{ width: "auto" }}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export { SuperadminCreateExamCyclePage };
