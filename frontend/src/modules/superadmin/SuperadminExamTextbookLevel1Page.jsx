import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listLevels } from "../../services/levelsService";
import { getExamTextbookLevel, saveExamTextbookLevel } from "../../services/examTextbookService";

function findLevel1(levels) {
  const byRank = levels.find((l) => Number(l?.rank) === 1);
  if (byRank) return byRank;
  const byName = levels.find((l) => String(l?.name || "").toLowerCase().includes("level 1"));
  return byName || levels[0] || null;
}

function SuperadminExamTextbookLevel1Page() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [level, setLevel] = useState(null);
  const [raw, setRaw] = useState("{");
  const [updatedAt, setUpdatedAt] = useState(null);

  const parsed = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch (e) {
      return { ok: false, error: e?.message || "Invalid JSON" };
    }
  }, [raw]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const levelsRes = await listLevels();
      const levels = Array.isArray(levelsRes?.data) ? levelsRes.data : [];
      const l1 = findLevel1(levels);
      setLevel(l1);

      if (!l1?.id) {
        setRaw("{}");
        setUpdatedAt(null);
        return;
      }

      const textbookRes = await getExamTextbookLevel(l1.id);
      const tb = textbookRes.data?.data?.textbook || null;
      if (tb?.content) {
        setRaw(JSON.stringify(tb.content, null, 2));
        setUpdatedAt(tb.updatedAt || null);
      } else {
        setRaw(
          JSON.stringify(
            {
              levelRank: 1,
              topics: []
            },
            null,
            2
          )
        );
        setUpdatedAt(null);
      }
    } catch (e) {
      setError(getFriendlyErrorMessage(e) || "Failed to load textbook data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!level?.id) return;
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await saveExamTextbookLevel(level.id, { content: parsed.value });
      setUpdatedAt(res.data?.data?.updatedAt || null);
      toast.success("Saved");
    } catch (e) {
      setError(getFriendlyErrorMessage(e) || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading textbook..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Level 1 Textbook Data</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
            Level: <b>{level ? `${level.name} / ${level.rank}` : "—"}</b>
            {updatedAt ? ` • Last updated: ${new Date(updatedAt).toLocaleString()}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => navigate(-1)}>
            Back
          </button>
          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void load()}>
            Refresh
          </button>
          <button className="button" type="button" style={{ width: "auto" }} onClick={() => void save()} disabled={saving || !parsed.ok || !level?.id}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      {!parsed.ok ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            JSON error: {parsed.error}
          </p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Paste your Level 1 textbook structure as JSON. Example: {"{\"topics\":[{\"title\":\"Addition\",\"subTopics\":[...] }]}"}
        </div>
        <textarea
          className="input"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          style={{ minHeight: 420, fontFamily: "monospace" }}
          spellCheck={false}
        />
      </div>
    </section>
  );
}

export { SuperadminExamTextbookLevel1Page };
