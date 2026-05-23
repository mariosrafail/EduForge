import { FileText, Image, Music, UploadCloud } from "lucide-react";
import { uploadFiles } from "../../data/mockCourses";
import Button from "../ui/Button";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";

const fileIcons = {
  "lesson-plan.docx": FileText,
  "activity-image.png": Image,
  "listening-audio.mp3": Music,
};

export default function LibraryPage({ onOpenUpload }) {
  return (
    <section className="library-page section-stack">
      <Card className="library-card" padding="lg">
        <div className="section-title">
          <div>
            <span className="section-kicker">Library</span>
            <h2>Βιβλιοθήκη αρχείων</h2>
            <p>Οργάνωσε υλικό που θα χρησιμοποιηθεί στις ενότητες, στις δραστηριότητες και στην τελική δημοσίευση.</p>
          </div>
          <Button variant="primary" onClick={onOpenUpload}>
            <UploadCloud size={18} />
            Mock upload
          </Button>
        </div>

        <button className="dropzone library-dropzone" onClick={onOpenUpload}>
          <UploadCloud size={34} />
          <span>Πάτησε για mock εισαγωγή υλικού</span>
          <small>Word, εικόνες, ήχος και βοηθητικά αρχεία μαθήματος.</small>
        </button>

        {uploadFiles.length === 0 ? (
          <EmptyState
            icon={UploadCloud}
            title="Δεν έχεις ανεβάσει ακόμα υλικό"
            description="Ανέβασε Word, εικόνες ή ήχους για να ξεκινήσεις."
            action={
              <Button variant="primary" onClick={onOpenUpload}>
                Εισαγωγή υλικού
              </Button>
            }
          />
        ) : (
          <div className="library-file-list">
            {uploadFiles.map((file) => {
              const Icon = fileIcons[file] || FileText;
              return (
                <div className="library-file-item" key={file}>
                  <Icon size={18} />
                  <span>{file}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
