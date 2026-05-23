import { useState } from "react";
import { Sparkles } from "lucide-react";
import { aiOptions } from "../../data/mockActivities";
import Button from "../ui/Button";
import Card from "../ui/Card";
import GeneratedResult from "./GeneratedResult";

export default function AiGenerator() {
  const [selected, setSelected] = useState(aiOptions);
  const [prompt, setPrompt] = useState("");
  const [generated, setGenerated] = useState(false);

  function toggleOption(option) {
    setSelected((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  return (
    <section className="split-layout">
      <Card className="form-card">
        <span className="section-kicker">AI Generator</span>
        <h2>Δημιουργία περιεχομένου</h2>
        <label htmlFor="ai-prompt">Υλικό ή στόχοι μαθήματος</label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Επικόλλησε εδώ ύλη, στόχους μαθήματος ή κείμενο από Word..."
        />
        <div className="checkbox-list">
          {aiOptions.map((option) => (
            <label key={option} className="checkbox-row">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggleOption(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <Button variant="primary" size="large" onClick={() => setGenerated(true)}>
          <Sparkles size={19} />
          Δημιουργία περιεχομένου
        </Button>
      </Card>

      <Card className="preview-card">
        <span className="section-kicker">Preview</span>
        <h2>Παραγόμενο αποτέλεσμα</h2>
        <GeneratedResult generated={generated} />
      </Card>
    </section>
  );
}
