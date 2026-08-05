export class ProjectMutationError extends Error {
  constructor(code, statusCode = 400, details = null) {
    super(code);
    this.name = "ProjectMutationError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
