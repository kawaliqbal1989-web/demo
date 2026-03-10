import axios from "axios";
import { decrement, increment } from "./loadingStore";
import { logApiError } from "../utils/apiErrors";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

const apiClient = axios.create({
  baseURL,
  timeout: 20000
});

let refreshInFlight = null;
let interceptorsInstalled = false;

function setupApiInterceptors({ getAccessToken, refreshToken, logout, onForbidden, getExtraHeaders }) {
  if (interceptorsInstalled) {
    return;
  }

  interceptorsInstalled = true;

  apiClient.interceptors.request.use((config) => {
    if (!config._skipGlobalLoading) {
      increment();
      config._globalLoadingTracked = true;
    }

    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    if (typeof getExtraHeaders === "function") {
      const extras = getExtraHeaders();
      if (extras && typeof extras === "object") {
        config.headers = config.headers || {};
        for (const [key, value] of Object.entries(extras)) {
          if (value === null || value === undefined || value === "") {
            continue;
          }
          config.headers[key] = value;
        }
      }
    }

    return config;
  });

  apiClient.interceptors.response.use(
    (response) => {
      try {
        if (response?.config?._globalLoadingTracked) {
          decrement();
        }

        // Extra debug: dump unexpected response shapes for easier troubleshooting
        const status = response?.status;
        const url = response?.config?.url || response?.request?.responseURL || "unknown";
        if (import.meta.env.DEV && (status >= 400 || response?.data == null)) {
          // eslint-disable-next-line no-console
          console.debug("api_response_debug", {
            url,
            status,
            data: response?.data,
            headers: response?.headers,
            config: {
              method: response?.config?.method,
              baseURL: response?.config?.baseURL
            }
          });
        }
      } catch (e) {
        // keep original flow even if logging fails
      }

      return response;
    },
    async (error) => {
      try {
        if (error?.config?._globalLoadingTracked) {
          decrement();
        }

        const suppressErrorLogging = Boolean(error?.config?._suppressErrorLogging);

        // Axios cancellation (AbortController) is expected during StrictMode double-invocation
        // and during rapid navigation; don't spam debug logs.
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError") {
          return Promise.reject(error);
        }

        const errorCode = error?.response?.data?.error_code || null;
        const url = error?.config?.url;
        const method = error?.config?.method;

        // Avoid noisy debug logs for expected control-flow conflicts.
        const isExpectedControlFlow =
          (errorCode === "SESSION_ALREADY_EXISTS" && method === "post" && url === "/teacher/attendance/sessions") ||
          (errorCode === "DUPLICATE_PENDING" && method === "post" && url === "/student/reassignment-requests") ||
          (errorCode === "FEATURE_NOT_ASSIGNED" && method === "get" && url === "/student/practice-worksheets/options") ||
          (errorCode === "FEATURE_NOT_ASSIGNED" && method === "get" && url === "/student/abacus-practice-worksheets/options");

        if (import.meta.env.DEV && !isExpectedControlFlow && !suppressErrorLogging) {
          // eslint-disable-next-line no-console
          console.error("api_error_debug", {
            message: error?.message,
            url,
            method,
            status: error?.response?.status,
            data: error?.response?.data,
            headers: error?.response?.headers
          });
        }
      } catch (e) {
        // noop
      }

      if (!error?.config?._suppressErrorLogging) {
        logApiError(error);
      }

      const originalRequest = error.config;
      const status = error.response?.status;

      if (status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          refreshInFlight = refreshInFlight || refreshToken();
          await refreshInFlight;
          refreshInFlight = null;

          return apiClient(originalRequest);
        } catch (refreshError) {
          refreshInFlight = null;
          logout();
          return Promise.reject(refreshError);
        }
      }

      // If request is still unauthorized after one refresh attempt,
      // the session is no longer recoverable in this tab.
      if (status === 401 && originalRequest?._retry) {
        logout();
      }

      const errorCode = error.response?.data?.error_code;
      if (status === 403 && typeof onForbidden === "function") {
        onForbidden(errorCode);
      }

      if ((status === 402 || errorCode === "SUBSCRIPTION_EXPIRED") && typeof onForbidden === "function") {
        // Reuse forbidden handler for routing, but keep code check separate.
        onForbidden("SUBSCRIPTION_EXPIRED");
      }

      return Promise.reject(error);
    }
  );
}

export { apiClient, setupApiInterceptors, baseURL };
