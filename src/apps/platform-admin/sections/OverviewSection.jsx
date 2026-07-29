import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BookOpenCheck, Building2, ClipboardCheck, GraduationCap, LockKeyhole, School,
  ShieldCheck, UsersRound,
} from "lucide-react";
import { PlatformEmptyState, PlatformLoadingState } from "../components/PlatformUi.jsx";

const metrics = [
  ["schools", "Schools", "All configured tenants", Building2],
  ["activeSchools", "Active schools", "Available to ordinary users", School],
  ["pausedSchools", "Paused schools", "Tenant access suspended", LockKeyhole],
  ["schoolAdmins", "School Admins", "Tenant administrators", ShieldCheck],
  ["teachers", "Teachers", "Active teaching accounts", GraduationCap],
  ["students", "Students", "Active learner accounts", UsersRound],
  ["classes", "Classes", "Across all schools", School],
  ["activePhaseOnePackages", "Phase 1 packages", "Currently active catalogue", BookOpenCheck],
  ["activeAssignments", "Active assignments", "Open learner work", ClipboardCheck],
  ["awaitingReview", "Awaiting review", "Teacher review queue", ClipboardCheck],
];

export function OverviewSection({ data, loading }) {
  const overview = data.overview?.overview;
  const reduceMotion = useReducedMotion();
  if (loading.overview && !overview) return <PlatformLoadingState label="Loading live platform metrics…" />;
  if (!overview) return <PlatformEmptyState icon={Building2} title="Metrics are unavailable">Refresh to request the latest database-backed overview.</PlatformEmptyState>;

  return (
    <div className="pa-metrics" aria-label="Platform metrics">
      {metrics.map(([key, label, support, Icon], index) => (
        <motion.article
          key={key}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : index * 0.035 }}
        >
          <div className="pa-metric-icon"><Icon size={20} aria-hidden="true" /></div>
          <div><strong>{overview[key] ?? "—"}</strong><span>{label}</span><small>{support}</small></div>
        </motion.article>
      ))}
    </div>
  );
}
