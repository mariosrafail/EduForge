import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { createBookActivity, listBookActivities } from "../../../../services/bookActivitiesApi.js";
import { createBookMediaAsset } from "../../../../services/bookMediaAssetsApi.js";
import { actionForActivity, activityTypeOptions, baseActivityPayload, buildActivityPayload, createQuestionId } from "./activityBuilderUtils.js";

const defaultQuestion = () => ({ id: createQuestionId("q"), prompt: "", options: ["", "", ""], correctOption: "" });
const defaultGap = () => ({ id: createQuestionId("gap"), prompt: "", answer: "", acceptedAnswers: "" });

export function BookActivityBuilderModal({ context, initialType = "multiple_choice", onClose, onActivityCreated, onExistingSelected }) {
  const [type, setType] = useState(initialType);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [form, setForm] = useState({ questions: [defaultQuestion()], items: [defaultGap()] });
  const [existingActivities, setExistingActivities] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isMedia = type === "media_video" || type === "media_audio";
  const titlePlaceholder = useMemo(() => activityTypeOptions.find((option) => option.id === type)?.label || "Activity", [type]);

  useEffect(() => {
    if (type !== "existing_activity_link" || !context) return undefined;
    let mounted = true;
    setLoadingExisting(true);
    listBookActivities({ packageSlug: context.packageSlug, componentSlug: context.componentSlug })
      .then((activities) => {
        if (mounted) setExistingActivities(activities);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "Could not load existing activities.");
      })
      .finally(() => {
        if (mounted) setLoadingExisting(false);
      });
    return () => {
      mounted = false;
    };
  }, [context, type]);

  const updateQuestion = (questionId, patch) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question)),
    }));
  };

  const updateQuestionOption = (questionId, optionIndex, value) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.id !== questionId) return question;
        const options = [...question.options];
        options[optionIndex] = value;
        return { ...question, options, correctOption: question.correctOption || value };
      }),
    }));
  };

  const updateGap = (itemId, patch) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  };

  const saveActivity = async () => {
    setSaving(true);
    setError("");
    try {
      if (!title.trim()) throw new Error("Title is required.");
      if (isMedia && !String(form.mediaUrl || "").trim()) throw new Error("Use a media URL for now. File upload storage is not configured yet.");

      let mediaAsset = null;
      if (isMedia) {
        mediaAsset = await createBookMediaAsset({
          packageSlug: context.packageSlug,
          componentSlug: context.componentSlug,
          pageId: context.pageId,
          fileName: String(form.mediaUrl).split("/").pop() || `${type}-url`,
          originalFileName: String(form.mediaUrl).split("/").pop() || `${type}-url`,
          mimeType: type === "media_video" ? "video/*" : "audio/*",
          publicUrl: form.mediaUrl,
          kind: type === "media_video" ? "video" : "audio",
        });
      }

      const contentPayload = buildActivityPayload({ type, title, instructions, mediaAsset, form });
      const activity = await createBookActivity(baseActivityPayload(context, type, title, instructions, mediaAsset?.id, contentPayload));
      onActivityCreated?.(activity, actionForActivity(activity));
    } catch (err) {
      setError(err.message || "Could not create activity.");
    } finally {
      setSaving(false);
    }
  };

  const renderBuilder = () => {
    if (type === "existing_activity_link") {
      return (
        <div className="book-builder-existing-list">
          {loadingExisting && <p>Loading activities...</p>}
          {!loadingExisting && existingActivities.length === 0 && <p>No custom activities yet.</p>}
          {existingActivities.map((activity) => (
            <button key={activity.id} type="button" onClick={() => onExistingSelected?.(activity, actionForActivity(activity))}>
              <strong>{activity.title}</strong>
              <small>{activity.type} {activity.pageNumber ? `· page ${activity.pageNumber}` : ""}</small>
            </button>
          ))}
        </div>
      );
    }

    if (type === "multiple_choice") {
      return (
        <div className="book-builder-list">
          {form.questions.map((question, questionIndex) => (
            <section key={question.id} className="book-builder-nested-panel">
              <label>Question
                <textarea value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} placeholder={`Question ${questionIndex + 1}`} />
              </label>
              {question.options.map((option, optionIndex) => (
                <label key={`${question.id}-${optionIndex}`}>Option {optionIndex + 1}
                  <span className="book-builder-inline-input">
                    <input value={option} onChange={(event) => updateQuestionOption(question.id, optionIndex, event.target.value)} />
                    <input type="radio" name={`correct-${question.id}`} checked={question.correctOption === option && Boolean(option)} onChange={() => updateQuestion(question.id, { correctOption: option })} />
                  </span>
                </label>
              ))}
              <div className="book-builder-row-actions">
                <button type="button" onClick={() => updateQuestion(question.id, { options: [...question.options, ""] })}><Plus size={14} /> Option</button>
                <button type="button" onClick={() => setForm((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }))} disabled={form.questions.length === 1}><Trash2 size={14} /> Remove</button>
              </div>
            </section>
          ))}
          <button className="secondary-action compact-action" type="button" onClick={() => setForm((current) => ({ ...current, questions: [...current.questions, defaultQuestion()] }))}><Plus size={15} /> Add question</button>
        </div>
      );
    }

    if (type === "open_answer") {
      return (
        <>
          <label>Prompt<textarea value={form.prompt || ""} onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))} /></label>
          <label>Accepted answers<textarea value={form.acceptedAnswers || ""} onChange={(event) => setForm((current) => ({ ...current, acceptedAnswers: event.target.value }))} placeholder="One accepted answer per line. Leave empty for teacher review." /></label>
        </>
      );
    }

    if (type === "typed_gap_fill") {
      return (
        <div className="book-builder-list">
          {form.items.map((item, index) => (
            <section key={item.id} className="book-builder-nested-panel">
              <label>Prompt<input value={item.prompt} onChange={(event) => updateGap(item.id, { prompt: event.target.value })} placeholder={`Sentence ${index + 1}`} /></label>
              <label>Answer<input value={item.answer} onChange={(event) => updateGap(item.id, { answer: event.target.value })} /></label>
              <label>Accepted answers<textarea value={item.acceptedAnswers} onChange={(event) => updateGap(item.id, { acceptedAnswers: event.target.value })} placeholder="One accepted answer per line" /></label>
              <button type="button" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((gap) => gap.id !== item.id) }))} disabled={form.items.length === 1}><Trash2 size={14} /> Remove</button>
            </section>
          ))}
          <button className="secondary-action compact-action" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, defaultGap()] }))}><Plus size={15} /> Add item</button>
        </div>
      );
    }

    if (type === "media_video") {
      return (
        <>
          <label>Media URL<input value={form.mediaUrl || ""} onChange={(event) => setForm((current) => ({ ...current, mediaUrl: event.target.value }))} placeholder="https://..." /></label>
          <label>Poster URL<input value={form.posterUrl || ""} onChange={(event) => setForm((current) => ({ ...current, posterUrl: event.target.value }))} placeholder="Optional" /></label>
          <p className="book-builder-note">File upload storage is not configured yet. Use a media URL for now.</p>
        </>
      );
    }

    if (type === "media_audio") {
      return (
        <>
          <label>Media URL<input value={form.mediaUrl || ""} onChange={(event) => setForm((current) => ({ ...current, mediaUrl: event.target.value }))} placeholder="https://..." /></label>
          <label>Transcript<textarea value={form.transcript || ""} onChange={(event) => setForm((current) => ({ ...current, transcript: event.target.value }))} /></label>
          <p className="book-builder-note">File upload storage is not configured yet. Use a media URL for now.</p>
        </>
      );
    }

    return <label>Body<textarea value={form.body || ""} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} /></label>;
  };

  return (
    <div className="book-activity-modal-backdrop" role="presentation">
      <div className="book-activity-builder-modal" role="dialog" aria-modal="true" aria-label="Activity builder">
        <header>
          <div>
            <span className="eyebrow">Page hotspot builder</span>
            <h3>Create or link action</h3>
          </div>
          <button className="image-zoom-close-button" type="button" onClick={onClose} aria-label="Close builder"><X size={18} /></button>
        </header>
        <div className="book-builder-type-grid">
          {[...activityTypeOptions, { id: "existing_activity_link", label: "Link existing" }].map((option) => (
            <button key={option.id} type="button" className={type === option.id ? "selected" : ""} onClick={() => setType(option.id)}>{option.label}</button>
          ))}
        </div>
        {type !== "existing_activity_link" && (
          <div className="book-builder-base-fields">
            <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={titlePlaceholder} /></label>
            <label>Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional" /></label>
          </div>
        )}
        <div className="book-builder-scroll">{renderBuilder()}</div>
        {error && <p className="book-builder-error">{error}</p>}
        <footer>
          <button className="secondary-action compact-action" type="button" onClick={onClose}>Cancel</button>
          {type !== "existing_activity_link" && <button className="primary-action compact-action" type="button" onClick={saveActivity} disabled={saving}>{saving ? "Saving..." : "Save activity"}</button>}
        </footer>
      </div>
    </div>
  );
}
