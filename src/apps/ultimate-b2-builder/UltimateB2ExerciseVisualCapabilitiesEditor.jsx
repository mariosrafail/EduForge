export function UltimateB2ExerciseVisualCapabilitiesEditor({ visualCapabilities, instructionOptions, showTextOptions, onChange }) {
  const instruction = visualCapabilities.instructionImage || "";
  const showTextEnabled = visualCapabilities.showText.enabled;
  return (
    <fieldset className="exercise-visual-capabilities-editor">
      <legend>Exercise visuals</legend>
      <label>Optional instruction image
        <select value={instruction} onChange={(event) => onChange((next) => { next.instructionImage = event.target.value || null; })}>
          <option value="">No instruction image</option>
          {instructionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="exercise-capability-toggle"><input type="checkbox" checked={showTextEnabled} disabled={!showTextOptions.length} onChange={(event) => onChange((next) => {
        next.showText.enabled = event.target.checked;
        next.showText.showTextImage = event.target.checked ? showTextOptions[0]?.value || null : null;
      })} /> Enable bottom Show Text button</label>
      {showTextEnabled && <label>Show Text image
        <select value={visualCapabilities.showText.showTextImage || ""} onChange={(event) => onChange((next) => { next.showText.showTextImage = event.target.value || null; })}>
          <option value="">Select an image</option>
          {showTextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>}
    </fieldset>
  );
}
