import { useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Card, Tag } from "../../Shared.jsx";
import { CustomVideoPlayer } from "./CustomVideoPlayer.jsx";

export function Unit2VideoOnlyScreen({ mode = "student", onBack, onContinue }) {
  const [watched, setWatched] = useState(false);

  return (
    <Card className="ultimate-media-card video-intro-only-card">
      <div className="ultimate-media-heading">
        <span className="eyebrow"><Play size={15} /> Watch before reading</span>
        <Tag tone={watched ? "green" : "gold"}>{watched ? "Ready for reading" : "Required intro"}</Tag>
      </div>
      <CustomVideoPlayer mode={mode} onWatched={() => setWatched(true)} />
      <p>This short introduction prepares students for the Unit 2 reading topic and key ideas.</p>
      {mode === "teacher-preview" && <div className="inline-status">Teacher preview can move through the slides without submitting a student attempt.</div>}
      <div className="ultimate-media-actions split-actions">
        {onBack && (
          <button className="secondary-action" type="button" onClick={onBack} data-sound-click="back">
            <ArrowLeft size={16} /> Back to page 20-21
          </button>
        )}
        <button
          className="primary-action"
          type="button"
          onClick={() => {
            if (!watched) setWatched(true);
            onContinue?.();
          }}
          data-sound-click="submit"
        >
          {watched ? "Continue to full text" : "Mark watched and continue"}
        </button>
      </div>
      {watched && <div className="inline-status success">Video watched.</div>}
    </Card>
  );
}
