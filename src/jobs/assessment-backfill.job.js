import { runAssessmentBackfill } from "../services/assessment-backfill.service.js";
import { runAssessmentParity } from "../services/assessment-parity.service.js";

async function runAssessmentBackfillJob({
  tenantId,
  sourceSystem,
  sourceEntityId,
  limit = 100,
  actorUserId = null,
  runParity = false
} = {}) {
  const backfill = await runAssessmentBackfill({
    tenantId,
    sourceSystem,
    sourceEntityId,
    limit,
    actorUserId
  });

  if (!runParity) {
    return {
      backfill,
      parity: null
    };
  }

  const parity = await runAssessmentParity({
    tenantId,
    sourceSystem,
    sourceEntityId,
    limit,
    actorUserId
  });

  return {
    backfill,
    parity
  };
}

export { runAssessmentBackfillJob };
