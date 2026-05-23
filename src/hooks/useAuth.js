import { useEffect, useState } from "react";
import { createSchoolAccount, getCurrentUser, signIn, signOut } from "../services/authApi.js";

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

  const handleCreateSchoolAccount = async (account) => {
    setAuthError("");
    const user = await createSchoolAccount(account);
    setCurrentUser(user);
    return user;
  };

  const handleSignOut = async () => {
    setAuthError("");
    await signOut();
    setCurrentUser(null);
  };

  return {
    currentUser,
    authLoading,
    authError,
    setAuthError,
    signIn: handleSignIn,
    createSchoolAccount: handleCreateSchoolAccount,
    signOut: handleSignOut,
  };
}
