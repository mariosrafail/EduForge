import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { PlatformAdminLogin } from "./components/PlatformAdminLogin.jsx";
import { PlatformAdminShell } from "./components/PlatformAdminShell.jsx";
import { PlatformAlert, PlatformButton, PlatformLoadingState } from "./components/PlatformUi.jsx";
import { SECTION_KEYS, getInitialPlatformSection, platformSections } from "./platformAdminNavigation.js";
import { AuditLogSection } from "./sections/AuditLogSection.jsx";
import { BookAccessSection } from "./sections/BookAccessSection.jsx";
import { ClassesSection } from "./sections/ClassesSection.jsx";
import { OverviewSection } from "./sections/OverviewSection.jsx";
import { SchoolsSection } from "./sections/SchoolsSection.jsx";
import { UsersSection } from "./sections/UsersSection.jsx";
import {
  platformApi,
  platformAuth,
  resetPlatformApiSession,
  setPlatformSecurityErrorHandler,
  setPlatformUnauthorizedHandler,
} from "./platformAdminApi.js";

export default function PlatformAdminApp() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState(getInitialPlatformSection);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const reduceMotion = useReducedMotion();

  const clearPrivilegedState = useCallback((message = "") => {
    setAdmin(null);
    setData({});
    setLoading({});
    setError("");
    setAuthMessage(message);
    history.replaceState({}, "", "/platform-admin/");
  }, []);

  useEffect(() => setPlatformUnauthorizedHandler(() => {
    clearPrivilegedState("Your privileged session expired. Sign in again.");
  }), [clearPrivilegedState]);

  useEffect(() => setPlatformSecurityErrorHandler((nextError) => {
    setError(nextError.message || "This privileged operation was forbidden.");
  }), []);

  useEffect(() => {
    let mounted = true;
    platformAuth.me()
      .then((payload) => {
        if (mounted && payload.platformAdmin?.id) setAdmin(payload.platformAdmin);
      })
      .catch((nextError) => {
        if (mounted && nextError.status !== 401 && !nextError.platformSessionCancelled) {
          setError("Platform Administration is temporarily unavailable.");
        }
      })
      .finally(() => { if (mounted) setChecking(false); });
    return () => { mounted = false; };
  }, []);

  const load = useCallback(async (target, filters = {}) => {
    setError("");
    setLoading((current) => ({ ...current, [target]: true }));
    try {
      const [payload, schoolPayload, userPayload] = await Promise.all([
        platformApi.get(target, filters),
        ["users", "access", "audit"].includes(target)
          ? platformApi.get("schools", { pageSize: 100 })
          : Promise.resolve(null),
        target === "access" ? platformApi.get("users", { pageSize: 100 }) : Promise.resolve(null),
      ]);
      setData((current) => ({
        ...current,
        [target]: payload,
        accessUsers: userPayload?.users || current.accessUsers || [],
        schoolsForFilters: schoolPayload?.schools || current.schoolsForFilters || [],
      }));
      return payload;
    } catch (nextError) {
      if (nextError.status !== 401 && !nextError.platformSessionCancelled) setError(nextError.message);
      return null;
    } finally {
      setLoading((current) => ({ ...current, [target]: false }));
    }
  }, []);

  useEffect(() => {
    if (admin) load(section);
  }, [admin, section, load]);

  useEffect(() => {
    const handlePopState = () => setSection(getInitialPlatformSection());
    addEventListener("popstate", handlePopState);
    return () => removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (next) => {
    if (!SECTION_KEYS.includes(next)) return;
    setSection(next);
    setError("");
    if (location.pathname !== `/platform-admin/${next}`) {
      history.pushState({}, "", `/platform-admin/${next}`);
    }
  };

  const signOut = async () => {
    try {
      await platformAuth.logout();
    } catch (nextError) {
      if (nextError.status !== 401) setError(nextError.message);
    } finally {
      resetPlatformApiSession();
      clearPrivilegedState();
    }
  };

  const authenticate = (identity) => {
    setAuthMessage("");
    setError("");
    setData({});
    setSection("overview");
    history.replaceState({}, "", "/platform-admin/overview");
    setAdmin(identity);
  };

  if (checking) return <PlatformLoadingState fullscreen label="Checking privileged session…" />;
  if (!admin) return <PlatformAdminLogin message={authMessage} error={error} onAuthenticated={authenticate} />;

  const currentSection = platformSections.find((item) => item.id === section);
  const sectionProps = { data, load, loading, setError };
  return (
    <PlatformAdminShell admin={admin} activeSection={section} onNavigate={navigate} onSignOut={signOut}>
      <header className="pa-page-heading">
        <div>
          <p>Cross-platform operations</p>
          <h1>{currentSection?.label}</h1>
          <span>{currentSection?.description}</span>
        </div>
        <PlatformButton variant="secondary" icon={RefreshCw} onClick={() => load(section)} loading={loading[section]}>
          Refresh
        </PlatformButton>
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={section}
          className="pa-section-stage"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -5 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          {error && <PlatformAlert tone="error" onDismiss={() => setError("")}>{error}</PlatformAlert>}
          {section === "overview" && <OverviewSection {...sectionProps} />}
          {section === "schools" && <SchoolsSection {...sectionProps} />}
          {section === "users" && <UsersSection {...sectionProps} />}
          {section === "classes" && <ClassesSection {...sectionProps} />}
          {section === "access" && <BookAccessSection {...sectionProps} />}
          {section === "audit" && <AuditLogSection {...sectionProps} />}
        </motion.div>
      </AnimatePresence>
    </PlatformAdminShell>
  );
}
