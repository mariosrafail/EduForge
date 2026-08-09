import { Download, Eye, EyeOff, Headphones, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

import {
  ultimateB2Unit1Part2HighlightGroups,
  ultimateB2Unit1Part2LegacyImages,
} from "../../../../data/ultimate-b2/unit1Part2LegacyPilotAssets.js";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { ultimateB2Unit1Part2LegacyAudio } from "virtual:ultimate-b2-unit1-part2-legacy-pilot-audio";
import { useExclusiveMediaPlayback } from "./shared/useExclusiveMediaPlayback.js";
import { TeacherLegacyQuestionFeedback, TeacherLegacyUnitOpenerAnswer } from "virtual:teacher-answer-ui";

const PdfSaver = registerPlugin("PdfSaver");

function LegacyInstruction({ src, alt }) {
  return <img className="legacy-pilot-instruction" src={src} alt={alt} draggable="false" />;
}

function LegacyReadingImage({ src, alt, activeGroup = null }) {
  return (
    <div className="legacy-pilot-reading-image">
      <img src={src} alt={alt} draggable="false" />
      {activeGroup?.regions.map((item, index) => (
        <span
          className="legacy-pilot-highlight-region"
          key={`${activeGroup.id}-${index}`}
          style={{
            left: `${item.left}%`,
            top: `${item.top}%`,
            width: `${item.width}%`,
            height: `${item.height}%`,
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function LegacyHighlightPlayer({ group, active, onActive, onEnded }) {
  const mediaRef = useRef(null);
  const announcePlayback = useExclusiveMediaPlayback(mediaRef);
  const configuredAsset = ultimateB2Unit1Part2LegacyAudio[group.logicalKey] || {};
  const asset = useBookAsset(configuredAsset.logicalKey, {
    devFallbackUrl: configuredAsset.devFallbackUrl || configuredAsset.localUrl || null,
  });

  return (
    <div className={`legacy-pilot-highlight-player ${active ? "active" : ""}`}>
      <span><Volume2 size={18} /> {group.label}</span>
      {asset.loading && <small>Loading audio…</small>}
      {asset.url && (
        <audio
          ref={mediaRef}
          controls
          preload="metadata"
          src={asset.url}
          onPlay={() => {
            announcePlayback();
            onActive(group);
          }}
          onEnded={onEnded}
          onError={onEnded}
        />
      )}
      {asset.error && !asset.url && (
        <button type="button" className="legacy-pilot-small-button" onClick={asset.retry}>Retry audio</button>
      )}
    </div>
  );
}

function LegacyReadingSupport({ activityId, image, initialVisible = false }) {
  const [textVisible, setTextVisible] = useState(initialVisible);
  const [activeGroup, setActiveGroup] = useState(null);
  const groups = ultimateB2Unit1Part2HighlightGroups[activityId] || [];

  return (
    <section className="legacy-pilot-reading-support">
      <div className="legacy-pilot-reading-toolbar">
        <button
          type="button"
          className="legacy-pilot-show-text"
          aria-pressed={textVisible}
          onClick={() => setTextVisible((current) => !current)}
        >
          {textVisible ? <EyeOff size={21} /> : <Eye size={21} />}
          {textVisible ? "Hide text" : "Show text"}
        </button>
        <span><Headphones size={18} /> Select a passage to hear the recovered publisher segment.</span>
      </div>
      {textVisible && <LegacyReadingImage src={image} alt="The Netflix Effect reading text" activeGroup={activeGroup} />}
      {!textVisible && (
        <div className="legacy-pilot-text-closed">
          <Eye size={34} />
          <strong>Reading text hidden</strong>
          <span>Use Show text to open the original publisher reading plate.</span>
        </div>
      )}
      <div className="legacy-pilot-highlight-list" aria-label="Publisher reading highlights">
        {groups.map((group) => (
          <LegacyHighlightPlayer
            key={group.id}
            group={group}
            active={activeGroup?.id === group.id}
            onActive={(next) => {
              setTextVisible(true);
              setActiveGroup(next);
            }}
            onEnded={() => setActiveGroup((current) => current?.id === group.id ? null : current)}
          />
        ))}
      </div>
    </section>
  );
}

function LegacyQuestion({
  activity,
  question,
  index,
  capabilities,
  answers,
  frozen,
  updateAnswer,
  checkResults,
  revealedQuestionIds,
  solutions,
  solutionsLoading,
  revealQuestion,
}) {
  const value = answers[question.id] || "";
  const result = checkResults[question.id] || "";
  const commonFeedback = (
      <TeacherLegacyQuestionFeedback
      capabilities={capabilities}
      question={question}
      checkResult={result}
      revealed={revealedQuestionIds.includes(question.id)}
      solutions={solutions}
      solutionsLoading={solutionsLoading}
      revealQuestion={revealQuestion}
    />
  );

  if (question.options.length) {
    return (
      <fieldset className={`legacy-pilot-question legacy-pilot-choice-question ${result ? `legacy-pilot-answer-${result}` : ""}`}>
        <legend><span>{index + 1}</span>{question.prompt}</legend>
        <div className="legacy-pilot-choice-grid">
          {question.options.map((option, optionIndex) => (
            <label key={option.id} className={value === option.text ? "selected" : ""}>
              <input
                type="radio"
                name={question.id}
                value={option.text}
                checked={value === option.text}
                disabled={frozen}
                onChange={(event) => updateAnswer(question.id, event.target.value)}
              />
              <b>{String.fromCharCode(65 + optionIndex)}</b>
              <span>{option.text}</span>
            </label>
          ))}
        </div>
        {commonFeedback}
      </fieldset>
    );
  }

  const openResponse = activity.implementationMode === "teacher-reviewed";
  return (
    <label className={`legacy-pilot-question legacy-pilot-write-question ${result ? `legacy-pilot-answer-${result}` : ""}`}>
      <span className="legacy-pilot-question-number">{index + 1}</span>
      <strong>{question.prompt}</strong>
      {openResponse ? (
        <textarea
          rows={activity.stableNormalizedId.endsWith("-o5") ? 7 : 3}
          value={value}
          disabled={frozen}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          aria-label={`Response ${index + 1}`}
        />
      ) : (
        <input
          type="text"
          value={value}
          disabled={frozen}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          aria-label={`Answer ${index + 1}`}
          autoComplete="off"
        />
      )}
      {commonFeedback}
    </label>
  );
}

function LegacyQuestions(props) {
  return (
    <div className="legacy-pilot-question-list">
      {props.activity.runtime.questions.map((question, index) => (
        <LegacyQuestion key={question.id} {...props} question={question} index={index} />
      ))}
    </div>
  );
}

function ObjectOne({ images, questionProps }) {
  const {
    activity,
    capabilities,
    answers,
    frozen,
    updateAnswer,
    revealedQuestionIds,
    solutions,
    solutionsLoading,
    revealQuestion,
  } = questionProps;
  const worksheetFilename = "ultimate-b2-unit-1-video-worksheet.pdf";
  const saveWorksheet = async (event) => {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault();
    await PdfSaver.savePdf({
      assetPath: new URL(images.worksheetPdf, globalThis.location.href).pathname,
      filename: worksheetFilename,
    });
  };

  return (
    <>
      <LegacyInstruction src={images.instruction} alt="Exercise 1. Watch the video and answer the questions." />
      <div className="legacy-pilot-object-one-questions">
        {activity.runtime.questions.map((question, index) => {
          const revealed = revealedQuestionIds.includes(question.id);
          const modelAnswer = solutions?.questions?.[question.id]?.acceptedAnswers?.[0] || "";
          return (
            <article className={`legacy-pilot-object-one-question question-${index + 1}`} key={question.id}>
              <h3><span>{index + 1}</span>{question.prompt}</h3>
              {capabilities.canEditAnswers && !capabilities.isPresentation ? (
                <textarea
                  aria-label={`Answer question ${index + 1}`}
                  rows={4}
                  value={answers[question.id] || ""}
                  disabled={frozen}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                />
              ) : capabilities.canRevealSolutions ? (
                <TeacherLegacyUnitOpenerAnswer
                  index={index}
                  revealed={revealed}
                  modelAnswer={modelAnswer}
                  solutionsLoading={solutionsLoading}
                  revealQuestion={revealQuestion}
                  questionId={question.id}
                />
              ) : (
                <div className="legacy-unit-opener-answer-lines" aria-hidden="true"><span /></div>
              )}
            </article>
          );
        })}
      </div>
      <a
        className="legacy-pilot-worksheet-download"
        href={images.worksheetPdf}
        download={worksheetFilename}
        type="application/pdf"
        onClick={saveWorksheet}
      ><Download size={20} /> Video Worksheet</a>
    </>
  );
}

function ObjectTwo({ images, mediaPlayers, questionProps }) {
  return (
    <>
      <LegacyInstruction src={images.instruction} alt="Exercise 2. Listen and read the text. Then answer the questions." />
      <div className="legacy-pilot-object-two-grid">
        <div className="legacy-pilot-reading-plate">
          <img src={images.background} alt="" aria-hidden="true" draggable="false" />
          <LegacyReadingSupport activityId={questionProps.activity.stableNormalizedId} image={images.readingText} />
        </div>
        <div className="legacy-pilot-response-column">
          <div className="legacy-pilot-main-audio">
            <span><Headphones size={21} /> Full reading audio</span>
            {mediaPlayers}
          </div>
          <LegacyQuestions {...questionProps} />
        </div>
      </div>
    </>
  );
}

function ObjectThree({ images, questionProps }) {
  return (
    <>
      <LegacyInstruction src={images.instruction} alt="Exercise 3. Read the text again and choose the best answer." />
      <div className="legacy-pilot-source-question-panels" aria-label="Original publisher question layout">
        {images.questionPanels.map((image, index) => (
          <img key={image} src={image} alt={`Original publisher question panel ${index + 1}`} draggable="false" />
        ))}
      </div>
      <div className="legacy-pilot-object-three-grid">
        <LegacyReadingSupport activityId={questionProps.activity.stableNormalizedId} image={images.readingText} />
        <LegacyQuestions {...questionProps} />
      </div>
    </>
  );
}

function ObjectFour({ images, questionProps }) {
  return (
    <>
      <LegacyInstruction src={images.instruction} alt="Exercise 4. Complete the sentences with words from the text." />
      <div className="legacy-pilot-object-four-grid">
        <details className="legacy-pilot-reference-text">
          <summary><Eye size={19} /> Reading text</summary>
          <img src={images.readingText} alt="Original publisher reading text with highlighted words" loading="lazy" />
        </details>
        <LegacyQuestions {...questionProps} />
      </div>
    </>
  );
}

function ObjectFive({ images, questionProps }) {
  return (
    <>
      <div className="legacy-pilot-debate-heading">
        <img src={images.badge} alt="Debate club" draggable="false" />
        <LegacyInstruction src={images.instruction} alt="Discuss the question using the ideas given, then present your arguments." />
      </div>
      <div className="legacy-pilot-debate-evidence">
        {images.photos.map((photo, index) => (
          <figure key={photo}>
            <img className="legacy-pilot-debate-photo" src={photo} alt={index === 0 ? "Watching a film at home" : "Watching a film at the cinema"} draggable="false" />
            <img className="legacy-pilot-debate-bubble" src={images.argumentBubbles[index]} alt={index === 0 ? "Example argument for watching at home" : "Example argument for going to the cinema"} draggable="false" />
          </figure>
        ))}
      </div>
      <LegacyQuestions {...questionProps} />
    </>
  );
}

export function UltimateB2LegacyPilotActivity({
  activity,
  capabilities,
  answers,
  frozen,
  updateAnswer,
  checkResults,
  revealedQuestionIds,
  solutions,
  solutionsLoading,
  revealQuestion,
  mediaPlayers,
  actions,
}) {
  const images = ultimateB2Unit1Part2LegacyImages[activity.stableNormalizedId];
  const objectNumber = Number(activity.stableNormalizedId.at(-1));
  const questionProps = {
    activity,
    capabilities,
    answers,
    frozen,
    updateAnswer,
    checkResults,
    revealedQuestionIds,
    solutions,
    solutionsLoading,
    revealQuestion,
  };
  const bodyProps = { images, mediaPlayers, questionProps };

  return (
    <article
      className={`unit2-normalized-activity ultimate-b2-legacy-pilot legacy-pilot--object-${objectNumber} ${capabilities.isPresentation ? "teacher-presentation-activity" : ""}`}
      data-legacy-pilot-activity={activity.stableNormalizedId}
    >
      {objectNumber !== 1 && <header className="legacy-pilot-titlebar">
        <div>
          <span>Unit 1 · Reading</span>
          <strong>Streaming now!</strong>
        </div>
        <b>Ultimate English B2</b>
      </header>}
      <section className="legacy-pilot-paper">
        {objectNumber === 1 && <ObjectOne {...bodyProps} />}
        {objectNumber === 2 && <ObjectTwo {...bodyProps} />}
        {objectNumber === 3 && <ObjectThree {...bodyProps} />}
        {objectNumber === 4 && <ObjectFour {...bodyProps} />}
        {objectNumber === 5 && <ObjectFive {...bodyProps} />}
      </section>
      {actions && <footer className="legacy-pilot-actions">{actions}</footer>}
    </article>
  );
}
