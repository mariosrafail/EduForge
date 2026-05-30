export const bookIds = ["students-book", "workbook", "grammar-book", "test-book"];

export const activityKeys = [
  "video-intro",
  "reading-ex3",
  "reading-ex4",
  "listening-page-20",
  "grammar-opening",
  "grammar-ex4",
  "quiz-2",
];

export const mainHashRoutes = {
  home: { view: "home" },
  flow: { view: "flow" },
  "auth-student": { view: "auth-student", role: "student" },
  "auth-teacher": { view: "auth-teacher", role: "teacher" },
  "auth-admin": { view: "auth-admin", role: "admin" },
  student: { view: "student", role: "student", section: "dashboard" },
  "student-dashboard": { view: "student", role: "student", section: "dashboard" },
  "student-books": { view: "student-books", role: "student", section: "books" },
  "student-assignments": { view: "student-assignments", role: "student", section: "assignments" },
  "student-grades": { view: "student-grades", role: "student", section: "grades" },
  "student-activity": { view: "student-activity", role: "student", section: "activity", activityKey: "reading-ex3", mode: "student" },
  "student-course": { view: "student-course", role: "student", section: "course" },
  "student-preview": { view: "student-preview", role: "student", section: "preview" },
  teacher: { view: "teacher", role: "teacher", section: "dashboard" },
  "teacher-dashboard": { view: "teacher", role: "teacher", section: "dashboard" },
  "teacher-books": { view: "teacher-books", role: "teacher", section: "books" },
  "teacher-classes": { view: "teacher-classes", role: "teacher", section: "classes" },
  "teacher-students": { view: "teacher-students", role: "teacher", section: "students" },
  "teacher-assignments": { view: "teacher-assignments", role: "teacher", section: "assignments" },
  "teacher-custom-assignment": { view: "teacher-custom-assignment", role: "teacher", section: "custom-assignment" },
  "teacher-course-editor": { view: "teacher-course-editor", role: "teacher", section: "custom-assignment" },
  admin: { view: "admin", role: "admin", section: "overview" },
  "admin-overview": { view: "admin", role: "admin", section: "overview" },
  "admin-school-setup": { view: "admin-school-setup", role: "admin", section: "school-setup" },
  "admin-users": { view: "admin-users", role: "admin", section: "users" },
  "admin-books-classes": { view: "admin-books-classes", role: "admin", section: "books-classes" },
  "admin-publisher-intelligence": { view: "admin-publisher-intelligence", role: "admin", section: "publisher-intelligence" },
  "admin-integrations": { view: "admin-integrations", role: "admin", section: "integrations" },
};

function cleanHash(hash = "") {
  return String(hash || "").replace(/^#/, "").trim();
}

export function buildBookHash(role, bookId) {
  return `${role}-book-${bookId}`;
}

export function buildActivityHash(activityKey, mode = "student") {
  return mode === "teacher-preview" ? `teacher-preview-${activityKey}` : `activity-${activityKey}`;
}

export function getBookFromHash(hash) {
  const hashView = cleanHash(hash);
  const bookMatch = hashView.match(/^(student|teacher)-book-(.+)$/);
  if (!bookMatch || !bookIds.includes(bookMatch[2])) return null;

  return {
    role: bookMatch[1],
    selectedBookId: bookMatch[2],
  };
}

export function getActivityFromHash(hash) {
  const hashView = cleanHash(hash);
  const studentMatch = hashView.match(/^activity-(.+)$/);
  if (studentMatch && activityKeys.includes(studentMatch[1])) {
    return { activityKey: studentMatch[1], mode: "student", role: "student" };
  }

  const teacherMatch = hashView.match(/^teacher-preview-(.+)$/);
  if (teacherMatch && activityKeys.includes(teacherMatch[1])) {
    return { activityKey: teacherMatch[1], mode: "teacher-preview", role: "teacher" };
  }

  return null;
}

export function parseHashRoute(hash = "") {
  const hashView = cleanHash(hash) || "home";
  const bookRoute = getBookFromHash(hashView);
  if (bookRoute) {
    return {
      hash: hashView,
      view: `${bookRoute.role}-books`,
      role: bookRoute.role,
      section: "books",
      selectedBookId: bookRoute.selectedBookId,
      activityKey: null,
      mode: bookRoute.role,
      valid: true,
    };
  }

  const activityRoute = getActivityFromHash(hashView);
  if (activityRoute) {
    return {
      hash: hashView,
      view: activityRoute.role === "teacher" ? "teacher-books" : "student-activity",
      role: activityRoute.role,
      section: activityRoute.role === "teacher" ? "books" : "activity",
      selectedBookId: null,
      activityKey: activityRoute.activityKey,
      mode: activityRoute.mode,
      valid: true,
    };
  }

  const mainRoute = mainHashRoutes[hashView];
  if (mainRoute) {
    return {
      hash: hashView,
      selectedBookId: null,
      activityKey: null,
      mode: mainRoute.role || "student",
      valid: true,
      ...mainRoute,
    };
  }

  return {
    hash: "home",
    view: "home",
    selectedBookId: null,
    activityKey: null,
    mode: "student",
    valid: false,
  };
}
