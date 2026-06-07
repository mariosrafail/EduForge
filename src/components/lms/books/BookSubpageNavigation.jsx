import { ArrowLeft, Copy } from "lucide-react";
import { Tag } from "../Shared.jsx";
import { buildBookPackageComponentHash, copyHashLink } from "./bookBrowserUtils.js";
import { getComponentRouteSlug } from "../../../utils/hashRoutes.js";

export function BookSubpageNavigation({ component, bookPackage, mode = "student", onBack }) {
  if (!component) return null;

  const role = mode === "teacher" ? "teacher" : "student";
  const canonicalBookId = getComponentRouteSlug(component);

  return (
    <div className="book-detail-toolbar subpage-nav">
      <button className="subpage-back-button" type="button" onClick={onBack} data-sound-click="back" aria-label="Back to all books">
        <ArrowLeft size={17} />
      </button>
      <div className="subpage-breadcrumb" aria-label="Book navigation">
        <button type="button" onClick={onBack} data-sound-click="tab">{bookPackage?.packageLabel || "Book package"}</button>
        <span aria-current="page">{component.title}</span>
      </div>
      <div className="book-detail-toolbar-actions">
        <button
          className="secondary-action compact-action"
          type="button"
          onClick={() => copyHashLink(buildBookPackageComponentHash(role, bookPackage, canonicalBookId))}
          data-sound-click="tab"
        >
          <Copy size={15} /> Copy book link
        </button>
        <Tag tone="blue">{mode === "teacher" ? "Teacher preview" : "Student view"}</Tag>
      </div>
    </div>
  );
}
