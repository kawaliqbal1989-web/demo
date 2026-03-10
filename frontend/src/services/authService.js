import axios from "axios";
import { apiClient, baseURL } from "./apiClient";

const authClient = axios.create({
  baseURL,
  timeout: 20000
});

async function loginRequest(payload) {
  const response = await authClient.post("/auth/login", payload);
  return response.data;
}

async function refreshRequest(refreshToken) {
  const response = await authClient.post("/auth/refresh", { refreshToken });
  return response.data;
}

async function logoutRequest(accessToken, refreshToken) {
  if (!accessToken) {
    return;
  }

  try {
    await authClient.post(
      "/auth/logout",
      { refreshToken },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch {
    return;
  }
}

async function meRequest() {
  const response = await apiClient.get("/auth/me");
  return response.data;
}

async function resetPasswordRequest({ targetUserId, newPassword, mustChangePassword = true }) {
  const response = await apiClient.post("/auth/reset-password", {
    targetUserId,
    newPassword,
    mustChangePassword
  });
  return response.data;
}

export { loginRequest, refreshRequest, logoutRequest, meRequest, resetPasswordRequest };
