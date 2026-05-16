import { useCallback, useEffect, useState } from "react";
import { getApiErrorCode } from "../../../utils/apiErrors";
import {
  approveSettlementWorkflow,
  clearSettlementWorkflowClientCache,
  escalateSettlementWorkflow,
  markSettlementWorkflowPaid,
  rejectSettlementWorkflow,
  reopenSettlementWorkflow,
  resolveSettlementEscalationWorkflow,
  reviewSettlementWorkflow,
  submitSettlementWorkflow,
  uploadSettlementSupportingRecord
} from "../services/settlementWorkflowService";

const ACTION_METHODS = {
  SUBMIT: submitSettlementWorkflow,
  REVIEW: reviewSettlementWorkflow,
  APPROVE: approveSettlementWorkflow,
  REJECT: rejectSettlementWorkflow,
  REOPEN: reopenSettlementWorkflow,
  ESCALATE: escalateSettlementWorkflow,
  RESOLVE: resolveSettlementEscalationWorkflow,
  MARK_PAID: markSettlementWorkflowPaid
};

function useSettlementWorkflowActions(settlementId, { onSuccess } = {}) {
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    setBusyAction(null);
    setError(null);
    setLastResult(null);
    setUploadProgress(0);
  }, [settlementId]);

  const runAction = useCallback(
    async (actionType, payload = {}) => {
      const actionMethod = ACTION_METHODS[actionType];
      if (!actionMethod) {
        throw new Error(`Unsupported workflow action: ${actionType}`);
      }

      setBusyAction(actionType);
      setError(null);

      try {
        const result = await actionMethod(settlementId, payload);
        setLastResult(result);

        if (typeof onSuccess === "function") {
          onSuccess(result, actionType);
        }

        return result;
      } catch (nextError) {
        setError(nextError);
        throw nextError;
      } finally {
        setBusyAction(null);
      }
    },
    [onSuccess, settlementId]
  );

  const uploadSupportingRecord = useCallback(
    async (payload = {}) => {
      setBusyAction("UPLOAD_SUPPORTING_RECORD");
      setError(null);
      setUploadProgress(0);

      try {
        const result = await uploadSettlementSupportingRecord(settlementId, payload, {
          onProgress: (progressValue) => {
            setUploadProgress(progressValue);
          }
        });
        setUploadProgress(100);
        setLastResult(result);

        if (typeof onSuccess === "function") {
          onSuccess(result, "UPLOAD_SUPPORTING_RECORD");
        }

        return result;
      } catch (nextError) {
        setError(nextError);
        throw nextError;
      } finally {
        setBusyAction(null);
      }
    },
    [onSuccess, settlementId]
  );

  const retry = useCallback(() => {
    clearSettlementWorkflowClientCache();
    setError(null);
  }, []);

  return {
    approveSettlement: (payload) => runAction("APPROVE", payload),
    busyAction,
    canRetry: Boolean(error),
    conflictError: getApiErrorCode(error) === "WORKFLOW_VERSION_CONFLICT",
    error,
    escalateSettlement: (payload) => runAction("ESCALATE", payload),
    isBusy: Boolean(busyAction),
    lastResult,
    markSettlementPaid: (payload) => runAction("MARK_PAID", payload),
    rejectSettlement: (payload) => runAction("REJECT", payload),
    reopenSettlement: (payload) => runAction("REOPEN", payload),
    resolveEscalation: (payload) => runAction("RESOLVE", payload),
    retry,
    reviewSettlement: (payload) => runAction("REVIEW", payload),
    submitSettlement: (payload) => runAction("SUBMIT", payload),
    uploadProgress,
    uploadSupportingRecord
  };
}

export { useSettlementWorkflowActions };