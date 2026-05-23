import { CheckCircle2 } from "lucide-react";
import { exportChecklist } from "../../data/mockActivities";

export default function ExportChecklist() {
  return (
    <div className="checklist">
      {exportChecklist.map((check) => (
        <div className="check-row" key={check}>
          <CheckCircle2 size={18} />
          {check}
        </div>
      ))}
    </div>
  );
}
