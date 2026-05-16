import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens
} from "./tokenStorage";
import { getMyFranchise } from "../services/franchiseService";
import {
  getRoleFromToken,
  getTenantFromToken,
  getUsernameFromToken,
  getStudentIdFromToken,
  getUserIdFromToken,
  isTokenExpired
} from "../utils/jwt";
import { getOrCreateClientSessionId } from "../utils/clientSession";
import { loginRequest, logoutRequest, refreshRequest } from "../services/authService";
import { setupApiInterceptors } from "../services/apiClient";
import {
  clearStoredMustChangePassword,
  clearStoredSubscriptionBlocked,
  getStoredMustChangePassword,
  getStoredSubscriptionBlocked,
  getStoredCapabilities,
  setStoredCapabilities,
  setStoredMustChangePassword,
  setStoredSubscriptionBlocked,
  clearStoredCapabilities,
  getStoredPartnerId,
  setStoredPartnerId,
  clearStoredPartnerId,
  getStoredFranchiseId,
  setStoredFranchiseId,
  clearStoredFranchiseId
} from "./sessionStorage";
import { meRequest } from "../services/authService";
import { getMyBranding } from "../services/brandingService";
import { clearStoredBranding, getStoredBranding, setStoredBranding } from "./sessionStorage";

const AuthContext = createContext(null);

const BRANDING_ENABLED_ROLES = new Set(["BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"]);

function canFetchBrandingForRole(role) {
  return BRANDING_ENABLED_ROLES.has(role);
}

function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState(() => getStoredAccessToken());
  const [refreshTokenValue, setRefreshTokenValue] = useState(() => getStoredRefreshToken());
  const [mustChangePassword, setMustChangePassword] = useState(() => getStoredMustChangePassword());
  const [subscriptionBlocked, setSubscriptionBlocked] = useState(() => getStoredSubscriptionBlocked());
  const [capabilities, setCapabilities] = useState(() => getStoredCapabilities());
  const [partnerId, setPartnerId] = useState(() => getStoredPartnerId());
  const [branding, setBranding] = useState(() => getStoredBranding());
  const [displayName, setDisplayName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [authBootstrapStatus, setAuthBootstrapStatus] = useState(() =>
    getStoredAccessToken() || getStoredRefreshToken() ? "loading" : "ready"
  );

  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const tenantId = useMemo(() => getTenantFromToken(accessToken), [accessToken]);
  const username = useMemo(() => getUsernameFromToken(accessToken), [accessToken]);
  const userId = useMemo(() => getUserIdFromToken(accessToken), [accessToken]);
  const studentId = useMemo(() => getStudentIdFromToken(accessToken), [accessToken]);

  const isAuthenticated = Boolean(accessToken && refreshTokenValue && !isTokenExpired(accessToken));
  const requiresPasswordChange = Boolean(mustChangePassword || getStoredMustChangePassword());
  const authBootstrapPending = authBootstrapStatus !== "ready";

  const storeBranding = useCallback((nextBranding) => {
    setBranding(nextBranding);
    setStoredBranding(nextBranding);
    return nextBranding;
  }, []);

  const refreshBranding = useCallback(async (options = {}) => {
    const token = getStoredAccessToken();
    const nextRole = getRoleFromToken(token);

    if (!canFetchBrandingForRole(nextRole)) {
      return storeBranding(null);
    }

    const brandingData = await getMyBranding({
      fresh: options.fresh ?? true,
      _skipGlobalLoading: true,
      _suppressErrorLogging: options.suppressErrorLogging ?? true
    });

    return storeBranding(brandingData?.data?.businessPartner || null);
  }, [storeBranding]);

  const applyTokens = ({ accessToken: nextAccess, refreshToken: nextRefresh }) => {
    setAccessToken(nextAccess);
    setRefreshTokenValue(nextRefresh);
    setStoredTokens({ accessToken: nextAccess, refreshToken: nextRefresh });
  };

  const clearSessionState = useCallback(() => {
    setAccessToken(null);
    setRefreshTokenValue(null);
    setMustChangePassword(false);
    setSubscriptionBlocked(false);
    setCapabilities(null);
    setPartnerId(null);
    setBranding(null);
    setDisplayName(null);
    setAuthBootstrapStatus("ready");
    clearStoredTokens();
    clearStoredMustChangePassword();
    clearStoredSubscriptionBlocked();
    clearStoredCapabilities();
    clearStoredPartnerId();
    clearStoredFranchiseId();
    clearStoredBranding();
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest(getStoredAccessToken(), getStoredRefreshToken());
    clearSessionState();
    navigate("/login", { replace: true });
  }, [clearSessionState, navigate]);

  const refreshSession = useCallback(async () => {
    const storedRefresh = getStoredRefreshToken();
    if (!storedRefresh) {
      throw new Error("Missing refresh token");
    }

    const data = await refreshRequest(storedRefresh);
    applyTokens({
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token
    });
  }, []);

  const login = async ({ tenantCode, username, password }) => {
    setLoading(true);
    try {
      const data = await loginRequest({ tenantCode, username, password });
      const nextAccessToken = data.data.access_token;
      const nextRefreshToken = data.data.refresh_token;
      const nextRole = getRoleFromToken(nextAccessToken);

      applyTokens({
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken
      });

      const caps = data.data.user?.capabilities || null;
      setCapabilities(caps);
      setStoredCapabilities(caps);

      const mustChange = Boolean(data.data.user?.must_change_password);
      setMustChangePassword(mustChange);
      setStoredMustChangePassword(mustChange);
      setAuthBootstrapStatus(mustChange ? "ready" : "loading");

      setSubscriptionBlocked(false);
      setStoredSubscriptionBlocked(false);

      const disp = data.data?.user?.displayName || null;
      setDisplayName(disp);

      setPartnerId(null);
      setStoredPartnerId(null);
      setBranding(null);
      setStoredBranding(null);
      setStoredFranchiseId(null);

      return {
        mustChangePassword: mustChange,
        role: nextRole
      };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setupApiInterceptors({
      getAccessToken: () => getStoredAccessToken(),
      refreshToken: refreshSession,
      logout,
      onForbidden: (code) => {
        if (code === "MUST_CHANGE_PASSWORD") {
          setMustChangePassword(true);
          setStoredMustChangePassword(true);
          navigate("/change-password", { replace: true });
          return;
        }

        if (code === "SUBSCRIPTION_EXPIRED") {
          setSubscriptionBlocked(true);
          setStoredSubscriptionBlocked(true);
          navigate("/subscription-blocked", { replace: true });
          return;
        }

        navigate("/unauthorized", { replace: true });
      },
      getExtraHeaders: () => {
        const clientSessionId = getOrCreateClientSessionId();
        const token = getStoredAccessToken();
        const currentRole = getRoleFromToken(token);

        if (currentRole === "STUDENT") {
          return {
            "x-user-role": "student",
            "x-user-id": getUserIdFromToken(token) || "",
            "x-student-id": getStudentIdFromToken(token) || "",
            "x-client-session": clientSessionId
          };
        }

        if (currentRole === "FRANCHISE") {
          return {
            "x-user-role": "franchise",
            "x-user-id": getUserIdFromToken(token) || "",
            "x-franchise-id": getStoredFranchiseId() || "",
            "x-client-session": clientSessionId
          };
        }

        if (currentRole === "BP") {
          return {
            "x-user-role": "partner",
            "x-user-id": getUserIdFromToken(token) || "",
            "x-partner-id": getStoredPartnerId() || "",
            "x-client-session": clientSessionId
          };
        }

        return { "x-client-session": clientSessionId };
      }
    });
    setApiReady(true);
  }, [navigate, logout, refreshSession]);

  useEffect(() => {
    if (!apiReady) {
      return;
    }

    const storedAccessToken = getStoredAccessToken();
    const storedRefreshToken = getStoredRefreshToken();

    if (!storedAccessToken && !storedRefreshToken) {
      setAuthBootstrapStatus("ready");
      return;
    }

    let cancelled = false;

    async function bootstrapSession() {
      setAuthBootstrapStatus("loading");

      if ((!storedAccessToken || isTokenExpired(storedAccessToken)) && storedRefreshToken) {
        try {
          await refreshSession();
        } catch {
          if (!cancelled) {
            clearSessionState();
          }
        }
        return;
      }

      if (!storedAccessToken || !storedRefreshToken || isTokenExpired(storedAccessToken)) {
        if (!cancelled) {
          clearSessionState();
        }
        return;
      }

      if (getStoredMustChangePassword()) {
        if (!cancelled) {
          setAuthBootstrapStatus("ready");
        }
        return;
      }

      const roleFromToken = getRoleFromToken(storedAccessToken);

      try {
        const [meData, scopedIdentity, brandingData] = await Promise.all([
          meRequest({ _skipGlobalLoading: true, _suppressErrorLogging: true }),
          roleFromToken === "FRANCHISE"
              ? getMyFranchise({ _skipGlobalLoading: true, _suppressErrorLogging: true }).catch(() => null)
              : Promise.resolve(null),
          canFetchBrandingForRole(roleFromToken)
            ? getMyBranding({ _skipGlobalLoading: true, _suppressErrorLogging: true }).catch(() => null)
            : Promise.resolve(null)
        ]);

        if (cancelled) {
          return;
        }

        const caps = meData?.data?.user?.capabilities || null;
        setCapabilities(caps);
        setStoredCapabilities(caps);

        const mustChange = Boolean(meData?.data?.user?.must_change_password);
        setMustChangePassword(mustChange);
        setStoredMustChangePassword(mustChange);

        const disp = meData?.data?.user?.displayName || null;
        setDisplayName(disp);

        if (roleFromToken === "BP") {
          const id = brandingData?.data?.businessPartner?.id || null;
          setPartnerId(id);
          setStoredPartnerId(id);
          setStoredFranchiseId(null);
        } else {
          setPartnerId(null);
          setStoredPartnerId(null);

          if (roleFromToken === "FRANCHISE") {
            const id = scopedIdentity?.data?.franchiseProfileId || null;
            setStoredFranchiseId(id);
          } else {
            setStoredFranchiseId(null);
          }
        }

        storeBranding(brandingData?.data?.businessPartner || null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error?.response?.status === 401) {
          clearSessionState();
          return;
        }
      }

      if (!cancelled) {
        setAuthBootstrapStatus("ready");
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [apiReady, accessToken, refreshTokenValue, refreshSession, clearSessionState, storeBranding]);

  const value = {
    accessToken,
    refreshToken: refreshTokenValue,
    role,
    tenantId,
    username,
    studentId,
    isAuthenticated,
    mustChangePassword,
    subscriptionBlocked,
    capabilities,
    partnerId,
    branding,
    refreshBranding,
    userId,
    displayName,
    loading,
    authBootstrapStatus,
    authBootstrapPending,
    login,
    logout,
    refreshSession,
    setMustChangePassword: (value) => {
      setMustChangePassword(Boolean(value));
      setStoredMustChangePassword(Boolean(value));
    },
    clearSubscriptionBlocked: () => {
      setSubscriptionBlocked(false);
      setStoredSubscriptionBlocked(false);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthProvider, AuthContext };
