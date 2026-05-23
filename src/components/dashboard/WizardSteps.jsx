import { ChevronRight, FileArchive, Layers3, Puzzle, UploadCloud } from "lucide-react";
import { wizardSteps } from "../../data/mockWizardSteps";

const icons = {
  upload: UploadCloud,
  modules: Layers3,
  activities: Puzzle,
  export: FileArchive,
};

export default function WizardSteps({ activeStep, onStepChange }) {
  return (
    <section className="wizard-grid">
      {wizardSteps.map((step, index) => {
        const Icon = icons[step.icon];
        return (
          <button
            key={step.id}
            className={`wizard-card ${activeStep === step.id ? "active" : ""}`}
            onClick={() => onStepChange(step.id)}
          >
            <div className={`step-icon ${step.color}`}>
              <Icon size={22} />
            </div>
            <div>
              <span>Βήμα {index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
            <ChevronRight size={18} />
          </button>
        );
      })}
    </section>
  );
}
