import { createContext, useCallback, useLayoutEffect, useMemo, useState } from "react";
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
import { getMyBusinessPartner } from "../services/businessPartnersService";
import { getMyBranding } from "../services/brandingService";
import { clearStoredBranding, getStoredBranding, setStoredBranding } from "./sessionStorage";

const AuthContext = createContext(null);

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

  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const tenantId = useMemo(() => getTenantFromToken(accessToken), [accessToken]);
  const username = useMemo(() => getUsernameFromToken(accessToken), [accessToken]);
  const userId = useMemo(() => getUserIdFromToken(accessToken), [accessToken]);
  const studentId = useMemo(() => getStudentIdFromToken(accessToken), [accessToken]);

  const isAuthenticated = Boolean(accessToken && refreshTokenValue && !isTokenExpired(accessToken));
  const requiresPasswordChange = Boolean(mustChangePassword || getStoredMustChangePassword());

  const applyTokens = ({ accessToken: nextAccess, refreshToken: nextRefresh }) => {
    setAccessToken(nextAccess);
    setRefreshTokenValue(nextRefresh);
    setStoredTokens({ accessToken: nextAccess, refreshToken: nextRefresh });
  };

  const logout = useCallback(async () => {
    await logoutRequest(getStoredAccessToken(), getStoredRefreshToken());
    setAccessToken(null);
    setRefreshTokenValue(null);
    setMustChangePassword(false);
    setSubscriptionBlocked(false);
    setCapabilities(null);
    setPartnerId(null);
    setBranding(null);
    setDisplayName(null);
    clearStoredTokens();
    clearStoredMustChangePassword();
    clearStoredSubscriptionBlocked();
    clearStoredCapabilities();
    clearStoredPartnerId();
    clearStoredFranchiseId();
    clearStoredBranding();
    navigate("/login", { replace: true });
  }, [navigate]);

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

  const shouldFetchBranding = useCallback(() => {
    const token = getStoredAccessToken();
    if (!token) {
      return false;
    }

    if (mustChangePassword || getStoredMustChangePassword()) {
      return false;
    }

    const roleFromToken = getRoleFromToken(token);
    const brandingEnabledRoles = ["BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"];
    if (!brandingEnabledRoles.includes(roleFromToken)) {
      return false;
    }

    if (isTokenExpired(token)) {
      return false;
    }

    return true;
  }, [mustChangePassword]);

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

      setSubscriptionBlocked(false);
      setStoredSubscriptionBlocked(false);

      const disp = data.data?.user?.displayName || null;
      setDisplayName(disp);

      setPartnerId(null);
      setStoredPartnerId(null);
      setBranding(null);
      setStoredBranding(null);
      if (nextRole !== "FRANCHISE" || mustChange) {
        setStoredFranchiseId(null);
      }

      return {
        mustChangePassword: mustChange,
        role: nextRole
      };
    } finally {
      setLoading(false);
    }
  };

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (!apiReady || !isAuthenticated || capabilities || requiresPasswordChange) {
      return;
    }

    let cancelled = false;
    void meRequest()
      .then((data) => {
        if (cancelled) {
          return;
        }

        const caps = data.data?.user?.capabilities || null;
        setCapabilities(caps);
        setStoredCapabilities(caps);

        const mustChange = Boolean(data.data?.user?.must_change_password);
        setMustChangePassword(mustChange);
        setStoredMustChangePassword(mustChange);

        const disp = data.data?.user?.displayName || null;
        setDisplayName(disp);
      })
      .catch(() => {
        // Ignore; interceptor will handle token refresh or logout if needed.
      });

    return () => {
      cancelled = true;
    };
  }, [apiReady, isAuthenticated, capabilities, requiresPasswordChange]);

  useLayoutEffect(() => {
    if (!apiReady || !isAuthenticated || requiresPasswordChange) {
      return;
    }

    if (role === "BP" && !partnerId) {
      let cancelled = false;
      void getMyBusinessPartner()
        .then((mine) => {
          if (cancelled) {
            return;
          }
          const id = mine?.data?.id || null;
          setPartnerId(id);
          setStoredPartnerId(id);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setPartnerId(null);
          setStoredPartnerId(null);
        });

      return () => {
        cancelled = true;
      };
    }

    if (role === "FRANCHISE" && !getStoredFranchiseId()) {
      let cancelled = false;
      void getMyFranchise()
        .then((mine) => {
          if (cancelled) {
            return;
          }
          const id = mine?.data?.franchiseProfileId || null;
          setStoredFranchiseId(id);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setStoredFranchiseId(null);
        });

      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [apiReady, isAuthenticated, partnerId, requiresPasswordChange, role]);

  useLayoutEffect(() => {
    if (!apiReady || !isAuthenticated || requiresPasswordChange || branding || !shouldFetchBranding()) {
      return;
    }

    let cancelled = false;
    void getMyBranding()
      .then((brandResp) => {
        if (cancelled) {
          return;
        }
        const bp = brandResp?.data?.businessPartner || null;
        setBranding(bp);
        setStoredBranding(bp);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setBranding(null);
        setStoredBranding(null);
      });

    return () => {
      cancelled = true;
    };
  }, [apiReady, isAuthenticated, branding, requiresPasswordChange, shouldFetchBranding]);

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
    userId,
    displayName,
    loading,
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
