import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Button from "../ui/Button";

export default function LearnerPreview({ course }) {
  const [feedback, setFeedback] = useState(false);

  return (
    <section className="learner-shell">
      <div className="learner-top">
        <span>Προεπισκόπηση μαθητή</span>
        <h2>{course?.title || "Ενότητα δείγματος"}</h2>
        <p>Διάβασε τη θεωρία και απάντησε στην ερώτηση. Το feedback εμφανίζεται αμέσως.</p>
      </div>
      <div className="learner-card">
        <h3>Κάρτα θεωρίας</h3>
        <p>Η βασική ιδέα μιας ενότητας πρέπει να είναι σύντομη, καθαρή και να συνδέεται με μια μικρή δραστηριότητα ελέγχου.</p>
      </div>
      <div className="learner-card">
        <h3>Παράδειγμα ερώτησης</h3>
        <p>Ποιο στοιχείο βοηθά τον μαθητή να καταλάβει τι πρέπει να κάνει;</p>
        <div className="answer-list">
          <button>Μεγάλο κείμενο χωρίς δομή</button>
          <button className="selected">Σαφής οδηγία και άμεσο feedback</button>
          <button>Πολλά κουμπιά χωρίς ετικέτες</button>
        </div>
        <Button variant="primary" onClick={() => setFeedback(true)}>
          <CheckCircle2 size={18} />
          Έλεγχος απάντησης
        </Button>
        {feedback && <div className="feedback">Σωστά. Η καθαρή οδηγία και το άμεσο feedback βοηθούν τη ροή μάθησης.</div>}
      </div>
    </section>
  );
}
