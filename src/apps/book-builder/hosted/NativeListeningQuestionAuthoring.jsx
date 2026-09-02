import { Plus, Trash2, Upload } from "lucide-react";

import { StageSelectionFrame } from "../../../components/builder-studio/StageSelectionFrame.jsx";
import { StageGeometryControls } from "../../../components/builder-studio/StageGeometryControls.jsx";
import { StudioButton, StudioField } from "../../../components/builder-studio/StudioControls.jsx";
import { NativeOpenResponseFontSurface } from "../../../components/native-open-response/NativeOpenResponseSurface.jsx";
import { resizeNativeOpenResponseRegion } from "../../../data/native-activities/nativeOpenResponse.js";
import { NativeOpenResponseResponseControls } from "./NativeOpenResponseResponseControls.jsx";

export function NativeListeningQuestionAuthoring({ mode, publicDraft, teacherDraft, interaction, questions, cues, snippets, selectedQuestion, selectedArtwork, selectedSnippet, selectedSnippetAudioReference, selection, selectedArea, surface, assetUrl, uploading, setSelectedQuestionId, setSelectedSnippetId, setSelection, mutatePublic, mutateTeacher, addQuestion, removeQuestion, moveQuestion, uploadArtwork, uploadSnippetAudio, removeSnippetAudio, addSnippet, removeSnippet, removeArtwork, commitArea, bookSlug, componentSlug, fonts, setAnswerFont, recordUploadedFont, onMessage }) {
  const surfaceDocument = {
    ...publicDraft,
    parts: [
      {
        ...publicDraft.parts[0],
        interaction: {
          kind: "open-response",
          surface,
          artwork: interaction.artwork,
          questions,
        },
      },
    ],
  };
  const selectedSurfaceQuestion = selection && !["artwork", "snippet"].includes(selection.type) ? questions.find((entry) => entry.id === selection.id) : null;
  const changeResponse = (questionId, key, value) => mutatePublic((next) => {
    const target = next.parts[0].interaction.questions.find((question) => question.id === questionId);
    const presentation = target.responseRegion.presentation;
    presentation[key] = value;
    if (key === "paddingX") presentation.lineWidth = Math.min(presentation.lineWidth, Math.max(1, target.responseRegion.area.width - 2 * value));
    if (key === "lineSpacing") { presentation.answerFontSizeMax = Math.min(presentation.answerFontSizeMax, Math.floor(value * .9), 72); presentation.answerFontSizeMin = Math.min(presentation.answerFontSizeMin, presentation.answerFontSizeMax); }
    if (key === "answerFontSizeMin") presentation.answerFontSizeMin = Math.min(Math.max(value, 8), presentation.answerFontSizeMax, 48);
    if (["paddingY", "lineSpacing", "lineCount"].includes(key)) resizeNativeOpenResponseRegion(target.responseRegion, target.responseRegion.area);
  });
  const updateQuestion = (questionId, mutator) => mutatePublic((next) => mutator(next.parts[0].interaction.questions.find((question) => question.id === questionId)));
  return (
    <div className="native-listening-question-authoring" data-authoring-mode={mode}>
      {["content", "answer-key"].includes(mode) ? (
        <div className="native-or-content">
          <div className="native-or-question-workspace">
            <aside>
              {mode === "content" ? (
                <button className="studio-primary-action" type="button" disabled={questions.length >= 20} onClick={addQuestion}>
                  <Plus /> Add Question
                </button>
              ) : null}
              {questions.map((question, index) => (
                <button
                  type="button"
                  key={question.id}
                  aria-current={question.id === selectedQuestion?.id ? "true" : undefined}
                  onClick={() => {
                    setSelectedQuestionId(question.id);
                    setSelection({ type: "prompt", id: question.id });
                  }}
                >
                  <strong>Question {index + 1}</strong>
                  <span>{question.prompt || "Untitled question"}</span>
                  <code>{question.id}</code>
                </button>
              ))}
            </aside>
            {selectedQuestion ? (
              <section className="native-or-question-editor">
                <header>
                  <strong>Question {questions.indexOf(selectedQuestion) + 1}</strong>
                  <code>{selectedQuestion.id}</code>
                  {mode === "content" ? (
                    <div>
                      <button type="button" disabled={questions.indexOf(selectedQuestion) === 0} onClick={() => moveQuestion(-1)}>
                        Move Up
                      </button>
                      <button type="button" disabled={questions.indexOf(selectedQuestion) === questions.length - 1} onClick={() => moveQuestion(1)}>
                        Move Down
                      </button>
                      <button type="button" onClick={removeQuestion}>
                        Delete Question
                      </button>
                    </div>
                  ) : null}
                </header>
                {mode === "content" ? (
                  <label>
                    <span>Public prompt / Prompt</span>
                    <textarea
                      aria-label="Prompt"
                      value={selectedQuestion.prompt}
                      maxLength="2000"
                      onChange={(event) =>
                        mutatePublic((next) => {
                          next.parts[0].interaction.questions.find((entry) => entry.id === selectedQuestion.id).prompt = event.target.value;
                        })
                      }
                    />
                  </label>
                ) : null}
                {mode === "answer-key" ? (
                  <label className="studio-teacher-field">
                    <span>
                      Teacher-only model answer <small>Private model answer · never shown to students</small>
                    </span>
                    <textarea
                      aria-label="Private model answer"
                      value={teacherDraft.parts[0].solution.modelAnswers.find((entry) => entry.questionId === selectedQuestion.id)?.text || ""}
                      maxLength="5000"
                      onChange={(event) =>
                        mutateTeacher((next) => {
                          next.parts[0].solution.modelAnswers.find((entry) => entry.questionId === selectedQuestion.id).text = event.target.value;
                        })
                      }
                    />
                  </label>
                ) : null}
              </section>
            ) : (
              <p>Add a question to begin.</p>
            )}
          </div>
        </div>
      ) : null}
      {mode === "visual" ? (
        <div className="native-or-layout studio-or-layout">
          <div className="studio-canvas-column">
            <div className="studio-canvas-toolbar has-contextual-controls">
              <div className="native-or-toolbar-actions">
                <label className="native-or-upload studio-upload-action">
                  <Upload />
                  <span>{uploading === "artwork" ? "Uploading…" : "Upload graphic"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={Boolean(uploading)}
                    onChange={(event) => {
                      uploadArtwork(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <StudioButton onClick={addSnippet} disabled={!cues.length || snippets.length >= 32}>
                  <Plus /> Add Show Text Hotspot
                </StudioButton>
                <section className="native-or-layers" aria-label="Artwork Layers">
                  <strong>Artwork Layers</strong>
                  <div>
                    {[...interaction.artwork].reverse().map((item) => (
                      <button type="button" key={item.id} aria-current={selection?.type === "artwork" && selection.id === item.id ? "true" : undefined} onClick={() => setSelection({ type: "artwork", id: item.id })}>
                        {item.altText || (item.decorative ? "Decorative graphic" : item.id)}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
            <div className="studio-canvas-viewport">
              <div className="studio-artboard-wrap">
                <NativeOpenResponseFontSurface
                  className="studio-artboard"
                  document={surfaceDocument}
                  assetUrl={assetUrl}
                  selected={selection}
                  onSelect={(value) => {
                    setSelection(value);
                    if (value && value.type !== "artwork") setSelectedQuestionId(value.id);
                  }}
                >
                  {snippets.map((snippet) => (
                    <button
                      type="button"
                      key={snippet.id}
                      className="native-listening-hotspot-dot"
                      aria-label={snippet.label}
                      aria-pressed={selection?.type === "snippet" && selection.id === snippet.id}
                      style={{
                        left: `${(snippet.area.x / surface.width) * 100}%`,
                        top: `${(snippet.area.y / surface.height) * 100}%`,
                        width: `${(snippet.area.width / surface.width) * 100}%`,
                        height: `${(snippet.area.height / surface.height) * 100}%`,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSnippetId(snippet.id);
                        setSelection({ type: "snippet", id: snippet.id });
                      }}
                    />
                  ))}
                  {selectedArea ? <StageSelectionFrame geometry={selectedArea} stage={surface} label={selection.type === "snippet" ? "Show Text hotspot" : selection.type === "prompt" ? "Prompt" : selection.type === "response" ? "Response region" : "Artwork"} locked={Boolean(selectedArtwork?.locked)} minWidth={selection.type === "response" ? Math.max(80, 2 * selectedSurfaceQuestion.responseRegion.presentation.paddingX + 1) : 24} minHeight={selection.type === "response" ? Math.max(44, 2 * selectedSurfaceQuestion.responseRegion.presentation.paddingY + selectedSurfaceQuestion.responseRegion.presentation.lineSpacing) : 24} moveFromGrip={selection.type !== "artwork"} onChange={commitArea} onClear={() => setSelection(null)} onDelete={selection.type === "artwork" ? removeArtwork : selection.type === "snippet" ? removeSnippet : undefined} zIndex={95} /> : null}
                </NativeOpenResponseFontSurface>
              </div>
            </div>
            {selection ? (
              <div className="studio-content-panel native-listening-question-properties">
                <h3>{selection.type === "snippet" ? "Show Text hotspot" : selection.type === "artwork" ? "Artwork" : selection.type === "response" ? "Response region" : "Prompt"}</h3>
                <StageGeometryControls area={selectedArea} stage={surface} label={`Listening ${selection.type}`} minWidth={selection.type === "response" ? Math.max(80, 2 * selectedSurfaceQuestion.responseRegion.presentation.paddingX + 1) : 24} minHeight={selection.type === "response" ? Math.max(44, 2 * selectedSurfaceQuestion.responseRegion.presentation.paddingY + selectedSurfaceQuestion.responseRegion.presentation.lineSpacing) : 24} locked={Boolean(selectedArtwork?.locked)} onChange={commitArea} />
                {selectedArtwork ? (
                  <>
                    <StudioField label="Alt text">
                      <input
                        value={selectedArtwork.altText}
                        onChange={(event) =>
                          mutatePublic((next) => {
                            next.parts[0].interaction.artwork.find((entry) => entry.id === selectedArtwork.id).altText = event.target.value;
                          })
                        }
                      />
                    </StudioField>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedArtwork.decorative}
                        onChange={(event) =>
                          mutatePublic((next) => {
                            next.parts[0].interaction.artwork.find((entry) => entry.id === selectedArtwork.id).decorative = event.target.checked;
                          })
                        }
                      />{" "}
                      Decorative
                    </label>
                    <StudioField label="Fit">
                      <select
                        value={selectedArtwork.fit}
                        onChange={(event) =>
                          mutatePublic((next) => {
                            next.parts[0].interaction.artwork.find((entry) => entry.id === selectedArtwork.id).fit = event.target.value;
                          })
                        }
                      >
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                      </select>
                    </StudioField>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedArtwork.locked}
                        onChange={(event) =>
                          mutatePublic((next) => {
                            next.parts[0].interaction.artwork.find((entry) => entry.id === selectedArtwork.id).locked = event.target.checked;
                          })
                        }
                      />{" "}
                      Lock position and size
                    </label>
                    <StudioButton variant="danger-ghost" onClick={removeArtwork}>
                      <Trash2 /> Remove graphic
                    </StudioButton>
                  </>
                ) : null}
                {selection.type === "response" && selectedSurfaceQuestion ? (
                  <>
                    <NativeOpenResponseResponseControls document={publicDraft} assetUrl={assetUrl} question={selectedSurfaceQuestion} modelAnswerText={teacherDraft.parts[0].solution.modelAnswers.find((entry) => entry.questionId === selectedSurfaceQuestion.id)?.text || ""} changeResponse={changeResponse} updateQuestion={updateQuestion} bookSlug={bookSlug} componentSlug={componentSlug} fonts={fonts} setAnswerFont={setAnswerFont} recordUploadedFont={recordUploadedFont} onMessage={onMessage} />
                  </>
                ) : null}
                {selection.type === "snippet" && selectedSnippet ? (
                  <>
                    <StudioField label="Accessible label">
                      <input
                        value={selectedSnippet.label}
                        onChange={(event) =>
                          mutatePublic((next) => {
                            next.parts[0].interaction.snippetHotspots.find((entry) => entry.id === selectedSnippet.id).label = event.target.value;
                          })
                        }
                      />
                    </StudioField>
                    <label className="studio-upload-action">
                      <Upload />
                      <span>
                        <strong>{uploading === "snippet-audio" ? "Uploading…" : selectedSnippetAudioReference ? "Replace hotspot MP3" : "Assign hotspot MP3"}</strong>
                        <small>{selectedSnippetAudioReference ? `Managed asset ${selectedSnippetAudioReference.slot}` : "Optional MP3 played by this hotspot"}</small>
                      </span>
                      <input
                        type="file"
                        accept="audio/mpeg,.mp3"
                        disabled={Boolean(uploading)}
                        onChange={(event) => {
                          uploadSnippetAudio(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {selectedSnippetAudioReference ? (
                      <StudioButton variant="danger-ghost" onClick={removeSnippetAudio}>
                        Remove MP3 assignment
                      </StudioButton>
                    ) : null}
                    <fieldset>
                      <legend>Transcript cues to display</legend>
                      {cues.map((cue, index) => (
                        <label key={cue.id}>
                          <input
                            type="checkbox"
                            checked={selectedSnippet.cueIds.includes(cue.id)}
                            onChange={(event) =>
                              mutatePublic((next) => {
                                const target = next.parts[0].interaction.snippetHotspots.find((entry) => entry.id === selectedSnippet.id);
                                target.cueIds = event.target.checked ? [...target.cueIds, cue.id] : target.cueIds.filter((id) => id !== cue.id);
                              })
                            }
                          />{" "}
                          Cue {index + 1}: {cue.text}
                        </label>
                      ))}
                    </fieldset>
                    <StudioButton variant="danger-ghost" onClick={removeSnippet}>
                      <Trash2 /> Delete Hotspot
                    </StudioButton>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
