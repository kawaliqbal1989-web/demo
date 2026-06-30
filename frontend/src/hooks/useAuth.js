import { useContext } from "react";
import { AuthContext } from "../auth/AuthContext";

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // In test environments or non-wrapped usage, return a safe fallback instead of throwing.
    return { user: null, token: null };
  }

  return context;
}

export { useAuth };
