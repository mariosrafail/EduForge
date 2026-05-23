import { Check, PencilLine } from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";

export default function ActivityEditor({ activeActivity }) {
  return (
    <Card as="aside" className="editor-panel">
      <span className="section-kicker">Editor</span>
      {activeActivity ? (
        <>
          <h2>{activeActivity}</h2>
          <label>Τίτλος δραστηριότητας</label>
          <input defaultValue={`${activeActivity} - νέα δραστηριότητα`} />
          <label>Οδηγία προς μαθητή/μαθήτρια</label>
          <textarea defaultValue="Διάβασε την εκφώνηση και ολοκλήρωσε τη δραστηριότητα." />
          <Button variant="primary">
            <Check size={17} />
            Αποθήκευση mock δραστηριότητας
          </Button>
        </>
      ) : (
        <EmptyState
          icon={PencilLine}
          title="Δεν έχει επιλεγεί δραστηριότητα"
          description="Διάλεξε “Δημιουργία” σε μια κάρτα για να ανοίξει ο mock editor."
        />
      )}
    </Card>
  );
}
