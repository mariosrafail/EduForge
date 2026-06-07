import { useState } from "react";
import { BookOpen, Play } from "lucide-react";
import { Card, Tag } from "../../Shared.jsx";
import { readingText } from "../ultimateB2ActivityContent.js";
import { StudentsBookPageGateway } from "./StudentsBookPageGateway.jsx";
import { ReadingExercise3 } from "./ReadingExercise3.jsx";
import { ReadingExercise4 } from "./ReadingExercise4.jsx";
import { ReadingTextAudioScreen } from "./ReadingTextAudioScreen.jsx";
import { Unit2VideoOnlyScreen } from "./Unit2VideoOnlyScreen.jsx";

function readingParagraphText(paragraph) {
  return (paragraph.parts || [paragraph.text]).map((part) => (typeof part === "string" ? part : `[${part.gap}]`)).join(" ");
}

function ReadingPreparationText({ highlighted = false }) {
  const highlightTerms = [
    "Bermuda Triangle",
    "electric fog",
    "never-ending tunnel",
    "electronic equipment stopped functioning",
    "already inside the Miami air space",
    "45 minutes",
  ];

  const renderHighlightedText = (text) => {
    const pattern = new RegExp(`(${highlightTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return text.split(pattern).map((part, index) => {
      const isHighlighted = highlightTerms.some((term) => term.toLowerCase() === part.toLowerCase());
      return isHighlighted ? <mark key={`${part}-${index}`}>{part}</mark> : <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <div className={`reading-prep-text ${highlighted ? "highlighted" : ""}`}>
      <div className="reading-prep-text-heading">
        <span className="eyebrow"><BookOpen size={15} /> Students Book / Unit 2 Reading</span>
        <h2>On a fast track</h2>
        <p>{highlighted ? "Key ideas are highlighted before students start the missing sentence exercise." : "Read the full text before moving on to the highlighted version."}</p>
      </div>
      <div className="reading-prep-paragraphs">
        {readingText.map((paragraph, index) => (
          <p key={paragraph.id}>
            <b>{index + 1}</b>
            <span>{highlighted ? renderHighlightedText(readingParagraphText(paragraph)) : readingParagraphText(paragraph)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function VideoIntroScreen({ mode, onSubmit, onNextActivity }) {
  const [watched, setWatched] = useState(false);
  const [screen, setScreen] = useState("page-gallery");
  const [gatewayOpenSectionId, setGatewayOpenSectionId] = useState(null);
  const completeVideo = () => {
    if (!watched) {
      setWatched(true);
      onSubmit?.({ activityKey: "video-intro", score: 100 });
    }
    setScreen("full-text");
  };

  if (screen === "page-gallery") {
    return (
      <StudentsBookPageGateway
        initialOpenSectionId={gatewayOpenSectionId}
        onContinue={() => {
          setGatewayOpenSectionId(null);
          setScreen("video");
        }}
        onTextAudio={() => {
          setGatewayOpenSectionId("reading-20-21");
          setScreen("text-audio");
        }}
        onExercise3={() => {
          setGatewayOpenSectionId(null);
          setScreen("exercise-3");
        }}
        onExercise4={() => {
          setGatewayOpenSectionId(null);
          setScreen("exercise-4");
        }}
      />
    );
  }

  if (screen === "text-audio") {
    return (
      <ReadingTextAudioScreen
        onBack={() => {
          setGatewayOpenSectionId("reading-20-21");
          setScreen("page-gallery");
        }}
        onStartExercise3={() => {
          setGatewayOpenSectionId(null);
          setScreen("exercise-3");
        }}
      />
    );
  }

  if (screen === "exercise-3") {
    return <ReadingExercise3 mode={mode} onSubmit={onSubmit} />;
  }

  if (screen === "exercise-4") {
    return <ReadingExercise4 mode={mode} onSubmit={onSubmit} />;
  }

  if (screen === "full-text") {
    return (
      <Card className="ultimate-media-card reading-prep-card">
        <div className="ultimate-media-heading">
          <span className="eyebrow"><BookOpen size={15} /> Reading slide</span>
          <Tag tone="blue">Full text</Tag>
        </div>
        <ReadingPreparationText />
        <button className="primary-action" type="button" onClick={() => setScreen("highlighted-text")} data-sound-click="submit">
          Continue to highlighted text
        </button>
      </Card>
    );
  }

  if (screen === "highlighted-text") {
    return (
      <Card className="ultimate-media-card reading-prep-card">
        <div className="ultimate-media-heading">
          <span className="eyebrow"><BookOpen size={15} /> Reading slide</span>
          <Tag tone="gold">Highlighted text</Tag>
        </div>
        <ReadingPreparationText highlighted />
        <button className="primary-action" type="button" onClick={() => onNextActivity?.("reading-ex3")} data-sound-click="submit">
          Start Exercise
        </button>
      </Card>
    );
  }

  return (
    <div className="video-intro-flow">
      <Unit2VideoOnlyScreen mode={mode} onContinue={completeVideo} />
      <div className="reading-flow-steps" aria-label="Reading flow">
        <span className="active">1 Video</span>
        <span>2 Full text</span>
        <span>3 Highlighted text</span>
        <span>4 Exercise</span>
      </div>
    </div>
  );
}
