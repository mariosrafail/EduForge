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


export function BookPackageSelector({ bookPackages, selectedPackageSlug, onSelectPackage }) {
  const visibleBookPackages = useMemo(() => dedupeBookPackages(bookPackages), [bookPackages]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.table(bookPackages.map((bookPackage) => ({
      title: bookPackage.packageTitle || bookPackage.title,
      slug: bookPackage.slug,
      id: bookPackage.id,
      source: bookPackage.source,
      key: normalizeBookPackageKey(bookPackage),
      components: bookPackage.components?.length || 0,
    })));
    console.table(visibleBookPackages.map((bookPackage) => ({
      title: bookPackage.packageTitle || bookPackage.title,
      slug: bookPackage.slug,
      id: bookPackage.id,
      source: bookPackage.source,
      key: normalizeBookPackageKey(bookPackage),
      components: bookPackage.components?.length || 0,
    })));
  }, [bookPackages, visibleBookPackages]);

  return (
    <Card className="book-package-selector">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Activated packages</span>
          <h2>Choose book package</h2>
        </div>
      </div>
      <div className="book-package-selector-grid">
        {visibleBookPackages.map((bookPackage) => {
          const packageSlug = bookPackage.slug || bookPackage.id || bookPackage.packageTitle;
          const packageKey = packageSlug || `${bookPackage.publisher || "package"}-${bookPackage.level || "level"}`;
          return (
            <button
              key={packageKey}
              type="button"
              className={selectedPackageSlug === packageSlug ? "selected" : ""}
              onClick={() => onSelectPackage(packageSlug)}
              data-sound-click="tab"
            >
              <strong>{bookPackage.packageTitle}</strong>
              <small>{bookPackage.level} / {bookPackage.components.length} components</small>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
