import { useEffect, useState } from "react";
import { createStudentAccount, getCurrentUser, signIn, signOut } from "../services/authApi.js";
import { resetDemoProgressAndLogout } from "../services/demoReset.js";

export function dashboardForRole(role) {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "teacher") return "teacher";
  if (normalized === "student") return "student";
  return "admin";
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      setAuthLoading(true);
      setAuthError("");

      try {
        const user = await getCurrentUser();
        if (!cancelled) setCurrentUser(user);
      } catch {
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = async (credentials) => {
    setAuthError("");
    const user = await signIn(credentials);
    setCurrentUser(user);
    return user;
  };

  const handleCreateStudentAccount = async (account) => {
    setAuthError("");
    const payload = await createStudentAccount(account);
    const user = payload.user;
    setCurrentUser(user);
    return payload;
  };

  const handleSignOut = async () => {
    setAuthError("");
    try {
      await signOut();
    } catch (error) {
      console.warn(error);
    } finally {
      resetDemoProgressAndLogout();
    }
    setCurrentUser(null);
  };

  return {
    currentUser,
    authLoading,
    authError,
    setAuthError,
    adoptAuthenticatedUser: setCurrentUser,
    signIn: handleSignIn,
    createStudentAccount: handleCreateStudentAccount,
    signOut: handleSignOut,
  };
}
