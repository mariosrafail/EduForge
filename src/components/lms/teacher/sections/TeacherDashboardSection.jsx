import { BookOpen, CheckCircle2, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dedupeBookPackages, demoBookPackages, normalizeBookPackageKey } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../../services/bookContentApi.js";
import {
  createAssignment,
  exportAssignmentResultsCsv,
  getAssignmentResults,
  listClassStudents,
  listTeacherAssignments,
  listTeacherStudents,
  reviewSubmission,
} from "../../../../services/assignmentsApi.js";
import { createTeacherClass } from "../../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildTeacherPresentationHash, buildTeacherSectionHash, slugifyRoute } from "../../../../utils/hashRoutes.js";
import { teacherBooksPresentation } from "../teacherBooksState.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../../Shared.jsx";
import { TeacherCourseEditor } from "../TeacherCourseEditor.jsx";
import { ClassInviteLink } from "../ClassInviteLink.jsx";
import { classBookOptions, classLevelOptions, teacherSections } from "../teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";
import { teacherSectionMetric } from "../../shared/portalDashboardPresentation.js";


export function TeacherDashboard({ goToSection, metricsState = { loading: true, error: "", data: null } }) {
  return (
    <>
      <SectionTitle
        eyebrow="Teacher portal"
        title="Teaching workspace."
        text="Choose a section to manage digital book access, class progress, student results, assigned exercises, or custom interactive activities."
      />

      {metricsState.error && (
        <div className="inline-status warning">
          Live dashboard metrics are unavailable. You can still use the teaching tools below.
        </div>
      )}
      <section className="teacher-dashboard-grid" aria-label="Teacher dashboard sections">
        {teacherSections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              className="teacher-dashboard-card"
              onClick={() => goToSection(section.id)}
              data-sound-click="submit"
            >
              <span className="teacher-dashboard-card-icon"><Icon size={25} /></span>
              <strong>{section.title}</strong>
              <p>{section.description}</p>
              <small>{teacherSectionMetric(section, metricsState)}</small>
            </button>
          );
        })}
      </section>
    </>
  );
}
