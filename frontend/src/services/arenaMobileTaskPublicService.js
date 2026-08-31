import axios from "axios";
import { baseURL } from "./apiClient";

const arenaMobilePublicClient = axios.create({
  baseURL,
  timeout: 15000
});

function unwrapArenaMobileResponse(response) {
  return response?.data?.data ?? response?.data ?? null;
}

async function claimArenaMobileTask(handoffToken) {
  const response = await arenaMobilePublicClient.post(
    "/arena/mobile-tasks/claim",
    { handoffToken }
  );

  return unwrapArenaMobileResponse(response);
}

async function startArenaMobileTask(claimToken) {
  const response = await arenaMobilePublicClient.post(
    "/arena/mobile-tasks/start",
    { claimToken }
  );

  return unwrapArenaMobileResponse(response);
}

async function submitArenaMobileTask(claimToken, payload) {
  const response = await arenaMobilePublicClient.post(
    "/arena/mobile-tasks/submit",
    {
      claimToken,
      ...payload
    }
  );

  return unwrapArenaMobileResponse(response);
}

export {
  claimArenaMobileTask,
  startArenaMobileTask,
  submitArenaMobileTask
};
