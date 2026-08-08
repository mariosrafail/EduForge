import { randomUUID } from "node:crypto";

import { TEACHER_PROJECT_LIMITS, TEACHER_UNIT_SLOTS } from "./constants.js";
import { TeacherProjectError } from "./errors.js";

const ENTRY_ID = /^entry-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ASSET_ID = /^asset-[a-f0-9]{32}$/;
export const TEACHER_PAGE_LAYOUTS = Object.freeze(["single-page", "double-wide", "double-pair"]);

function fail(code, details = null) {
  throw new TeacherProjectError(code, 400, details);
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function optionalText(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length > maximum) fail(code);
  return normalized;
}

function assetReference(value) {
  if (value === null) return null;
  if (!ASSET_ID.test(String(value || ""))) fail("invalid_teacher_asset_reference");
  return String(value);
}

export function assertTeacherPageEntryId(value) {
  if (!ENTRY_ID.test(String(value || ""))) fail("invalid_teacher_page_entry_id");
  return String(value);
}

export function createTeacherPageEntryId() {
  return `entry-${randomUUID()}`;
}

export function createBlankTeacherContent() {
  return {
    studentsBook: {
      units: TEACHER_UNIT_SLOTS.map(({ id }) => ({ id, entries: [] })),
    },
  };
}

function validateEntry(entry, ids) {
  const layout = String(entry?.layout || "");
  const keys = layout === "double-pair"
    ? ["id", "sectionTitle", "pageLabel", "layout", "leftImage", "rightImage"]
    : ["id", "sectionTitle", "pageLabel", "layout", "image"];
  exactObject(entry, keys, "invalid_teacher_page_entry");
  assertTeacherPageEntryId(entry.id);
  if (ids.has(entry.id)) fail("duplicate_teacher_page_entry_id", { entryId: entry.id });
  ids.add(entry.id);
  entry.sectionTitle = optionalText(entry.sectionTitle, 120, "invalid_teacher_page_section_title");
  entry.pageLabel = optionalText(entry.pageLabel, 80, "invalid_teacher_page_label");
  if (!TEACHER_PAGE_LAYOUTS.includes(layout)) fail("invalid_teacher_page_layout");
  if (layout === "double-pair") {
    assetReference(entry.leftImage);
    assetReference(entry.rightImage);
  } else {
    assetReference(entry.image);
  }
  return entry;
}

export function validateTeacherProjectContent(content) {
  exactObject(content, ["studentsBook"], "invalid_teacher_project_content");
  exactObject(content.studentsBook, ["units"], "invalid_teacher_students_book_content");
  const units = content.studentsBook.units;
  if (!Array.isArray(units) || units.length !== TEACHER_UNIT_SLOTS.length) fail("invalid_teacher_content_units");
  const ids = new Set();
  units.forEach((unit, index) => {
    exactObject(unit, ["id", "entries"], "invalid_teacher_content_unit");
    if (unit.id !== TEACHER_UNIT_SLOTS[index].id || !Array.isArray(unit.entries) || unit.entries.length > TEACHER_PROJECT_LIMITS.entriesPerUnit) {
      fail("invalid_teacher_content_unit");
    }
    unit.entries.forEach((entry) => validateEntry(entry, ids));
  });
  return content;
}

export function teacherProjectContentAssetIds(content) {
  const result = [];
  for (const unit of content.studentsBook.units) for (const entry of unit.entries) {
    if (entry.layout === "double-pair") result.push(entry.leftImage, entry.rightImage);
    else result.push(entry.image);
  }
  return result.filter(Boolean);
}

export function teacherProjectContentStatus(content) {
  validateTeacherProjectContent(content);
  const issuesByUnit = {};
  let entryCount = 0;
  let completeEntryCount = 0;
  let unitCountWithContent = 0;
  for (const unit of content.studentsBook.units) {
    if (unit.entries.length) unitCountWithContent += 1;
    entryCount += unit.entries.length;
    const unitIssues = [];
    for (const entry of unit.entries) {
      const issues = [];
      if (!entry.pageLabel) issues.push("Page label missing");
      if (entry.layout === "double-pair") {
        if (!entry.leftImage) issues.push("Left page image missing");
        if (!entry.rightImage) issues.push("Right page image missing");
      } else if (!entry.image) issues.push(entry.layout === "double-wide" ? "Spread image missing" : "Page image missing");
      if (issues.length) unitIssues.push({ entryId: entry.id, sectionTitle: entry.sectionTitle, pageLabel: entry.pageLabel, issues });
      else completeEntryCount += 1;
    }
    if (unitIssues.length) issuesByUnit[unit.id] = unitIssues;
  }
  return {
    valid: completeEntryCount === entryCount,
    unitCountWithContent,
    entryCount,
    completeEntryCount,
    incompleteEntryCount: entryCount - completeEntryCount,
    issuesByUnit,
  };
}
