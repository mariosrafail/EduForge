export class TeacherProjectError extends Error {
  constructor(code, statusCode = 400, details = null) {
    super(code);
    this.name = "TeacherProjectError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function teacherProjectError(error, fallback = "teacher_project_operation_failed") {
  if (error instanceof TeacherProjectError) return error;
  if (error?.code === "ENOENT") return new TeacherProjectError("teacher_project_not_found", 404);
  return new TeacherProjectError(fallback, 500);
}
