import { USER_IMPORT_HEADERS, USER_IMPORT_LIMITS } from "../../shared/userImport.js";

export const USER_IMPORT_TEMPLATE = [
  "full_name,email,role,level",
  "Example Teacher,teacher.one@example.invalid,Teacher,B2",
  "Example Student,student.one@example.invalid,Student,A2",
].join("\r\n");

function csvError(message) {
  throw new Error(message);
}

function parseRecords(source) {
  const records = [];
  let record = [];
  let field = "";
  let state = "start";
  let line = 1;
  let recordLine = 1;

  const finishField = () => {
    record.push(field);
    field = "";
    state = "start";
  };
  const finishRecord = () => {
    finishField();
    if (!(record.length === 1 && record[0] === "")) records.push({ cells: record, line: recordLine });
    record = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (state === "quoted") {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          state = "closed";
        }
      } else {
        field += character;
        if (character === "\n") line += 1;
      }
      continue;
    }
    if (state === "closed") {
      if (character === ",") {
        finishField();
      } else if (character === "\n") {
        finishRecord();
        line += 1;
      } else if (character === "\r" && source[index + 1] === "\n") {
        finishRecord();
        index += 1;
        line += 1;
      } else {
        csvError(`Unexpected character after a closing quote on line ${line}`);
      }
      continue;
    }
    if (state === "start" && character === '"') {
      state = "quoted";
    } else if (character === ",") {
      finishField();
    } else if (character === "\n") {
      finishRecord();
      line += 1;
    } else if (character === "\r" && source[index + 1] === "\n") {
      finishRecord();
      index += 1;
      line += 1;
    } else {
      field += character;
      state = "plain";
    }
  }
  if (state === "quoted") csvError("CSV contains an unclosed quoted field");
  if (record.length || field || state === "closed" || (source && !/[\r\n]$/.test(source))) finishRecord();
  return records;
}

function normalizeHeaders(cells) {
  const headers = cells.map((cell) => cell.trim().toLowerCase());
  if (headers.some((header) => !header)) csvError("CSV contains an empty header");
  if (headers.includes("name") && headers.includes("full_name")) csvError("Use either name or full_name, not both");
  const normalized = headers.map((header) => header === "name" ? "full_name" : header);
  if (new Set(normalized).size !== normalized.length) csvError("CSV contains duplicate headers");
  const unknown = normalized.filter((header) => !USER_IMPORT_HEADERS.includes(header));
  if (unknown.length) csvError(`Unknown CSV header: ${unknown[0]}`);
  for (const required of ["full_name", "email", "role"]) {
    if (!normalized.includes(required)) csvError(`Missing required CSV header: ${required}`);
  }
  return normalized;
}

export function parseUserImportCsv(input) {
  const original = String(input ?? "");
  if (new TextEncoder().encode(original).byteLength > USER_IMPORT_LIMITS.fileBytes) {
    csvError("CSV file must be 256 KiB or smaller");
  }
  if (original.includes("\0")) csvError("CSV cannot contain NUL characters");
  const source = original.replace(/^\uFEFF/, "");
  if (!source.trim()) csvError("CSV file is empty");
  const records = parseRecords(source);
  if (!records.length) csvError("CSV file is empty");
  const headers = normalizeHeaders(records[0].cells);
  if (records.length === 1) csvError("CSV must contain at least one user row");
  if (records.length - 1 > USER_IMPORT_LIMITS.rows) csvError("CSV cannot contain more than 200 user rows");

  return records.slice(1).map(({ cells, line }) => {
    if (cells.length !== headers.length) csvError(`CSV row ${line} has an inconsistent field count`);
    const values = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    return {
      rowNumber: line,
      fullName: values.full_name,
      email: values.email,
      role: values.role,
      level: values.level ?? "",
    };
  });
}

export function downloadUserImportTemplate(documentObject = document, urlObject = URL) {
  const blob = new Blob([USER_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = urlObject.createObjectURL(blob);
  const anchor = documentObject.createElement("a");
  anchor.href = url;
  anchor.download = "eduforge-user-import-template.csv";
  anchor.click();
  urlObject.revokeObjectURL(url);
}
