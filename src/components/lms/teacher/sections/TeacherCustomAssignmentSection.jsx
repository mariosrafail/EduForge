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


export function TeacherCustomAssignment(props) {
  const steps = [
    ["1", "Choose source", "Pick a book, unit, or component before editing."],
    ["2", "Choose activity", "Select the interactive activity type."],
    ["3", "Edit content", "Update prompts, answers, and feedback."],
    ["4", "Preview and assign", "Check the student view before assigning."],
  ];

  return (
    <section className="teacher-section-stack teacher-custom-section">
      <SectionTitle
        eyebrow="Custom Assignment"
        title="Create or edit custom interactive activities."
        text="The existing course editor remains available here for custom assignments, previews, and activity authoring."
      />
      <div className="custom-assignment-workspace">
        <aside className="custom-assignment-steps" aria-label="Custom assignment steps">
          {steps.map(([number, title, text]) => (
            <article key={title}>
              <b>{number}</b>
              <strong>{title}</strong>
              <span>{text}</span>
            </article>
          ))}
        </aside>
        <div className="embedded-teacher-editor">
          <TeacherCourseEditor {...props} />
        </div>
      </div>
    </section>
  );
}
