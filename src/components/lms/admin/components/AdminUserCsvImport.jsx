import { useRef, useState } from "react";
import { Download, UploadCloud, X } from "lucide-react";
import { commitUserImport, previewUserImport } from "../../../../services/userImportApi.js";
import { downloadUserImportTemplate, parseUserImportCsv } from "../../../../utils/userImportCsv.js";
import { USER_IMPORT_LIMITS } from "../../../../../shared/userImport.js";

const initialState = {
  fileName: "",
  rows: [],
  preview: null,
  error: "",
  result: null,
};

export function AdminUserCsvImport({ onOpen, onImported }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initialState);
  const [phase, setPhase] = useState("idle");
  const inputRef = useRef(null);

  const reset = () => {
    setState(initialState);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (phase === "committing") return;
    reset();
    setOpen(false);
  };

  const showImporter = () => {
    reset();
    onOpen?.();
    setOpen(true);
  };

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    setState(initialState);
    if (!file) return;
    if (file.size > USER_IMPORT_LIMITS.fileBytes) {
      setState({ ...initialState, fileName: file.name, error: "CSV file must be 256 KiB or smaller" });
      return;
    }
    setPhase("parsing");
    try {
      const rows = parseUserImportCsv(await file.text());
      setState({ ...initialState, fileName: file.name, rows });
      setPhase("previewing");
      const preview = await previewUserImport(rows);
      setState({ fileName: file.name, rows, preview, error: "", result: null });
      setPhase("ready");
    } catch (error) {
      setState((current) => ({ ...current, fileName: file.name, error: error.message || "CSV could not be previewed" }));
      setPhase("idle");
    }
  };

  const commit = async () => {
    if (!state.preview?.canImport || phase === "committing") return;
    setPhase("committing");
    setState((current) => ({ ...current, error: "", result: null }));
    try {
      const result = await commitUserImport(state.rows);
      await onImported?.();
      setState((current) => ({ ...current, result }));
      setPhase("complete");
    } catch (error) {
      const message = error.status >= 500
        ? "No accounts were imported. Correct the reported issue and try again."
        : error.message || "No accounts were imported. Correct the reported issue and try again.";
      setState((current) => ({
        ...current,
        preview: error.payload?.rows ? error.payload : current.preview,
        error: message,
      }));
      setPhase("ready");
    }
  };

  if (!open) {
    return (
      <div className="admin-import-actions">
        <button className="secondary-action" type="button" data-sound-click="submit" onClick={showImporter}>
          <UploadCloud size={17} /> Import CSV
        </button>
        <button className="secondary-action compact-action" type="button" onClick={() => downloadUserImportTemplate()}>
          <Download size={16} /> Download template
        </button>
      </div>
    );
  }

  const failed = state.result?.summary.failedDelivery || 0;
  const created = state.result?.summary.created || 0;
  const delivered = state.result?.summary.delivered || 0;

  return (
    <section className="admin-import-panel" aria-label="CSV user import">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><UploadCloud size={15} /> Invitation-only user import</span>
          <h3>Preview CSV users before importing</h3>
          <p>Teacher and Student accounts only. Imports do not add classes or book access.</p>
        </div>
        <button type="button" className="secondary-action compact-action" disabled={phase === "committing"} onClick={close}>
          <X size={16} /> Close
        </button>
      </div>

      <div className="admin-import-actions">
        <label className="secondary-action">
          Select CSV
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={phase === "committing"}
            onChange={selectFile}
          />
        </label>
        <button type="button" className="secondary-action compact-action" onClick={() => downloadUserImportTemplate()}>
          <Download size={16} /> Download template
        </button>
        {state.fileName && <small>Selected: {state.fileName}</small>}
      </div>

      {phase === "parsing" && <div className="inline-status">Parsing CSV…</div>}
      {phase === "previewing" && <div className="inline-status">Validating preview with the server…</div>}
      {state.error && <div className="inline-status error">{state.error}</div>}

      {state.preview && (
        <>
          <div className={state.preview.canImport ? "inline-status success" : "inline-status warning"}>
            {state.preview.summary.total} rows: {state.preview.summary.valid} valid and {state.preview.summary.invalid} invalid.
            {state.preview.summary.duplicateInFile ? ` ${state.preview.summary.duplicateInFile} duplicate rows.` : ""}
            {state.preview.summary.existingAccounts ? ` ${state.preview.summary.existingAccounts} existing accounts.` : ""}
          </div>
          <div className="data-table user-import-preview" aria-label="CSV user preview">
            {state.preview.rows.map((row, index) => (
              <div key={`${row.rowNumber}-${row.email}-${index}`}>
                <small>Row {row.rowNumber}</small>
                <strong>{row.fullName || "Missing name"}<small>{row.email || "Missing email"}</small></strong>
                <span>{row.role || "Missing role"}</span>
                <span>{row.level || "No level"}</span>
                <span>{row.status === "valid" ? "Valid" : row.errors.map((error) => error.message).join("; ")}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {phase === "committing" && <div className="inline-status">Creating invitation accounts…</div>}
      {state.result && failed === 0 && (
        <div className="inline-status success">
          {created} invitation accounts created and {delivered} invitation emails sent.
        </div>
      )}
      {state.result && failed > 0 && (
        <div className="inline-status warning">
          {created} invitation accounts were created. {delivered} invitation emails were sent and {failed} failed.
          Failed invitations can be resent from the user table.
        </div>
      )}

      <div className="admin-import-actions">
        {!state.result && (
          <button
            type="button"
            className="primary-action"
            disabled={!state.preview?.canImport || phase !== "ready"}
            onClick={commit}
          >
            {phase === "committing" ? "Creating invitation accounts…" : `Import ${state.preview?.summary.valid || 0} invitation accounts`}
          </button>
        )}
        <button type="button" className="secondary-action" disabled={phase === "committing"} onClick={state.result ? close : reset}>
          {state.result ? "Close importer" : "Cancel and reset"}
        </button>
      </div>
    </section>
  );
}
