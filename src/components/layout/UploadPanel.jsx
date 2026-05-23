import { FileText, UploadCloud, X } from "lucide-react";
import { uploadFiles } from "../../data/mockCourses";
import Button from "../ui/Button";

export default function UploadPanel({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="inline-panel">
      <div className="inline-panel-head">
        <div>
          <span className="section-kicker">Mock Upload</span>
          <h2>Εισαγωγή αρχείων</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Κλείσιμο upload">
          <X size={18} />
        </button>
      </div>
      <div className="dropzone">
        <UploadCloud size={34} />
        <p>Σύρε αρχεία εδώ ή πάτησε για mock επιλογή αρχείου.</p>
        <Button onClick={onClose}>Προσθήκη στα αρχεία</Button>
      </div>
      <div className="file-list">
        {uploadFiles.map((file) => (
          <div key={file}>
            <FileText size={17} />
            {file}
          </div>
        ))}
      </div>
    </div>
  );
}
