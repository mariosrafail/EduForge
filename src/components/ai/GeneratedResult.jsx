import { generatedQuestions, generatedSections } from "../../data/mockActivities";
import EmptyState from "../ui/EmptyState";
import { Sparkles } from "lucide-react";

export default function GeneratedResult({ generated }) {
  if (!generated) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Δεν υπάρχει ακόμη αποτέλεσμα"
        description="Πάτησε “Δημιουργία περιεχομένου” για να εμφανιστεί mock πρόταση μαθήματος."
      />
    );
  }

  return (
    <div className="result-stack">
      <div>
        <h3>Προτεινόμενες ενότητες</h3>
        <ol>
          {generatedSections.map((section) => (
            <li key={section}>{section}</li>
          ))}
        </ol>
      </div>
      <div>
        <h3>3 ερωτήσεις</h3>
        <ul>
          {generatedQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
      <div className="highlight-box green">Δραστηριότητα: Σύρε τις έννοιες στη σωστή κατηγορία.</div>
      <div className="highlight-box blue">Οδηγία μαθητή: Διάβασε πρώτα τη θεωρία και μετά δοκίμασε την άσκηση χωρίς βοήθεια.</div>
    </div>
  );
}
