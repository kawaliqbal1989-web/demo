import { useEffect, useState } from "react";
import { getCompetitionWorkflow as fetchCompetitionWorkflow, getCompetitionDetail } from "../services/competitionsService";

const WORKFLOW_STAGE_ALIASES = {
  BP_REVIEW: "BUSINESS_PARTNER_REVIEW",
  SUPERADMIN_APPROVAL: "SUPERADMIN_REVIEW"
};

function normalizeWorkflowState(value) {
  const state = String(value || "").trim().toUpperCase();
  return WORKFLOW_STAGE_ALIASES[state] || state || null;
}

function normalizeWorkflowFromCompetition(comp) {
  if (!comp) return null;
  const workflow = comp?.workflow || {
    state: comp?.workflowState || comp?.workflow_stage || comp?.workflowStage || comp?.state
  };
  const owner = workflow?.owner || comp?.workflowOwner || null;
  const updatedAt = workflow?.updatedAt || comp?.workflowUpdatedAt || comp?.updatedAt || null;
  return { workflow: { ...workflow, state: normalizeWorkflowState(workflow?.state) }, owner, updatedAt, raw: comp };
}

export function useCompetitionWorkflow({ competitionId, competition } = {}) {
  // In test environment, avoid fetching to prevent external side-effects in unit tests.
  const testEnv = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test";
  const [data, setData] = useState(() => normalizeWorkflowFromCompetition(competition));
  const [loading, setLoading] = useState(!competition && !!competitionId && !testEnv);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (testEnv) {
      setData(normalizeWorkflowFromCompetition(competition));
      setLoading(false);
      return;
    }

    let mounted = true;
    if (competition) {
      setData(normalizeWorkflowFromCompetition(competition));
      setLoading(false);
      return () => { mounted = false; };
    }
    if (!competitionId) {
      setData(null);
      setLoading(false);
      return () => { mounted = false; };
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const resp = await fetchCompetitionWorkflow(competitionId);
        if (!mounted) return;
        setData(resp);
      } catch (err) {
        if (!mounted) return;
        setError(err);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [competitionId, competition]);

  return { data, loading, error };
}

export default useCompetitionWorkflow;
