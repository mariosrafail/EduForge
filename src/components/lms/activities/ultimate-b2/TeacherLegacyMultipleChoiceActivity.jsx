import { BookOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ultimateB2Unit1Part2LegacyAudio } from "virtual:ultimate-b2-unit1-part2-legacy-pilot-audio";
import { useExclusiveMediaPlayback } from "./shared/useExclusiveMediaPlayback.js";
import "./teacherLegacyMultipleChoiceActivity.css";

function areaStyle(area, expand = 0) {
  return {
    left: area.x - expand,
    top: area.y - expand,
    width: area.width + expand * 2,
    height: area.height + expand * 2,
  };
}

export function TeacherLegacyMultipleChoiceActivity({ authoring, images, presentation = null }) {
  const [panelIndex, setPanelIndex] = useState(0);
  const [view, setView] = useState("questions");
  const [attempts, setAttempts] = useState({});
  const [solved, setSolved] = useState({});
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const audioRef = useRef(null);
  const textViewportRef = useRef(null);
  const returnPanelRef = useRef(0);
  const lastCommandToken = useRef(null);
  const announcePlayback = useExclusiveMediaPlayback(audioRef);
  const onStateChange = presentation?.onStateChange;
  const panels = authoring.panels;
  const panel = panels[panelIndex];
  const activeQuestion = authoring.questions.find((question) => question.id === activeQuestionId) || null;

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const returnToQuestions = useCallback(() => {
    stopAudio();
    setActiveQuestionId(null);
    setPanelIndex(returnPanelRef.current);
    setView("questions");
  }, [stopAudio]);

  const toggleText = useCallback(() => {
    if (view === "text") {
      returnToQuestions();
      return;
    }
    returnPanelRef.current = panelIndex;
    setActiveQuestionId(null);
    setView("text");
  }, [panelIndex, returnToQuestions, view]);

  const movePanel = useCallback((delta) => {
    stopAudio();
    setActiveQuestionId(null);
    setView("questions");
    setPanelIndex((current) => Math.max(0, Math.min(panels.length - 1, current + delta)));
  }, [panels.length, stopAudio]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (command.type === "toggle-text") toggleText();
    if (command.type === "previous-panel") movePanel(-1);
    if (command.type === "next-panel") movePanel(1);
  }, [movePanel, presentation?.command, toggleText]);

  useEffect(() => {
    onStateChange?.({
      view,
      panelIndex,
      panelCount: panels.length,
      activeQuestionId,
    });
  }, [activeQuestionId, onStateChange, panelIndex, panels.length, view]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  useEffect(() => {
    if (view !== "text" || !activeQuestion || !textViewportRef.current) return;
    const firstRegion = activeQuestion.highlightRegions[0];
    textViewportRef.current.scrollTo({ top: Math.max(0, firstRegion.y - 100), behavior: "instant" });
  }, [activeQuestion, view]);

  const imageForAsset = useMemo(() => ({
    "image_1.png": images.questionPanels[0],
    "image_2.png": images.instruction,
    "image_3.png": images.questionPanels[1],
    "showText.png": images.readingText,
  }), [images]);

  const choose = (question, option) => {
    if (solved[question.id]) return;
    const correct = option.id === question.correctOptionId;
    setAttempts((current) => ({ ...current, [option.id]: correct ? "correct" : "wrong" }));
    if (correct) setSolved((current) => ({ ...current, [question.id]: option.id }));
    setAnnouncement(`Question ${question.number}: ${correct ? "correct" : "incorrect"}.`);
  };

  const openReference = (question) => {
    stopAudio();
    returnPanelRef.current = panelIndex;
    setActiveQuestionId(question.id);
    setView("text");
  };

  const currentQuestions = authoring.questions.filter((question) => question.panelId === panel.id);
  const audioAsset = activeQuestion ? ultimateB2Unit1Part2LegacyAudio[activeQuestion.audioLogicalKey] : null;

  return (
    <div className="teacher-multiple-choice-stage" data-multiple-choice-view={view} data-multiple-choice-panel={panel.number}>
      {view === "questions" ? (
        <section className="teacher-multiple-choice-panel" aria-label={`Multiple Choice, part ${panel.number} of ${panels.length}`}>
          {panel.instructionArea && <img className="teacher-multiple-choice-source-image" src={imageForAsset[authoring.assets.instructionImage]} style={areaStyle(panel.instructionArea)} alt="Read the text again and choose the best answer." draggable="false" />}
          <img className="teacher-multiple-choice-source-image" src={imageForAsset[panel.imageAsset]} style={areaStyle(panel.imageArea)} alt={`Publisher multiple-choice panel ${panel.number}`} draggable="false" />
          {currentQuestions.map((question) => (
            <div key={question.id}>
              <button
                type="button"
                className="teacher-multiple-choice-reference"
                style={areaStyle(question.referenceArea)}
                onClick={() => openReference(question)}
                aria-label={`Open text reference for question ${question.number}`}
                title={`Question ${question.number} text reference`}
              ><BookOpen aria-hidden="true" /></button>
              {question.options.map((option) => {
                const state = solved[question.id] === option.id ? "correct" : attempts[option.id] || "neutral";
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`teacher-multiple-choice-option is-${state}`}
                    style={areaStyle(option.area, 7)}
                    disabled={Boolean(solved[question.id])}
                    onClick={() => choose(question, option)}
                    aria-label={`Question ${question.number} option ${option.label}: ${option.text}`}
                    aria-pressed={state === "correct"}
                    data-question-number={question.number}
                    data-option-label={option.label}
                    data-answer-state={state}
                  ><span>{option.label}</span></button>
                );
              })}
            </div>
          ))}
        </section>
      ) : (
        <section className="teacher-multiple-choice-text-shell" aria-label="The Netflix Effect reading text">
          <div className="teacher-multiple-choice-text-viewport" ref={textViewportRef}>
            <div className="teacher-multiple-choice-text-canvas" style={{ width: authoring.textSurface.width, height: authoring.textSurface.height }}>
              <img src={imageForAsset[authoring.assets.textImage]} alt="The Netflix Effect reading text" draggable="false" />
              {activeQuestion?.highlightRegions.map((region) => <span key={region.id} className="teacher-multiple-choice-highlight" style={areaStyle(region)} aria-hidden="true" />)}
            </div>
          </div>
          {audioAsset?.localUrl && <audio
            ref={audioRef}
            className="teacher-multiple-choice-hidden-audio"
            src={audioAsset.localUrl}
            autoPlay
            onPlay={announcePlayback}
            onEnded={returnToQuestions}
            onError={returnToQuestions}
          />}
        </section>
      )}
      <span className="teacher-multiple-choice-announcement" role="status" aria-live="polite">{announcement}</span>
    </div>
  );
}
