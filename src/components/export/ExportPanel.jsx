import { useState } from "react";
import { Archive, FileText, ListChecks } from "lucide-react";
import { exportOptions } from "../../data/mockActivities";
import Button from "../ui/Button";
import Card from "../ui/Card";
import ExportChecklist from "./ExportChecklist";

export default function ExportPanel() {
  const [exportReady, setExportReady] = useState(false);
  const [selectedOption, setSelectedOption] = useState(exportOptions[0]);

  return (
    <Card className="export-section">
      <div className="section-title">
        <div>
          <span className="section-kicker">Export</span>
          <h2>Επιλογές εξαγωγής</h2>
        </div>
        <Button variant="primary" onClick={() => setExportReady(true)}>
          <ListChecks size={18} />
          Προετοιμασία εξαγωγής
        </Button>
      </div>
      <div className="export-options">
        {exportOptions.map((option) => (
          <button
            className={`export-option ${selectedOption === option ? "selected" : ""}`}
            key={option}
            onClick={() => setSelectedOption(option)}
          >
            <FileText size={20} />
            {option}
          </button>
        ))}
        <button className="export-option disabled" disabled>
          <Archive size={20} />
          Course Forge package
          <span>Σύντομα</span>
        </button>
      </div>
      {exportReady && <ExportChecklist />}
    </Card>
  );
}
