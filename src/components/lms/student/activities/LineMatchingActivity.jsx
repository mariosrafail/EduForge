import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scoreLineMatching } from "../../../../utils/matchingScoring.js";
import { useSoundEffects } from "../../../../context/SoundContext.jsx";
import { ConnectionDeleteButton } from "./ConnectionDeleteButton.jsx";
import { ConnectionLine } from "./ConnectionLine.jsx";
import { MatchingNode } from "./MatchingNode.jsx";

const connectionColors = ["#f97316", "#0b1f3a", "#0f766e", "#7c3aed", "#16a34a", "#d97706"];

function colorForConnection(leftId, rightId) {
  const key = `${leftId}:${rightId}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(index);
    hash |= 0;
  }
  return connectionColors[Math.abs(hash) % connectionColors.length];
}

function centerForEndpoint(containerRect, node) {
  const rect = node.getBoundingClientRect();
  const x = rect.left - containerRect.left + rect.width / 2;
  const y = rect.top - containerRect.top + rect.height / 2;
  return { x, y };
}

function findItemAtPoint(items, refs, clientX, clientY) {
  return items.find((item) => {
    const node = refs.current[item.id];
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  })?.id || "";
}

export function LineMatchingActivity({ activity, answers, onChange, submitted }) {
  const { playSound } = useSoundEffects();
  const containerRef = useRef(null);
  const leftRefs = useRef({});
  const rightRefs = useRef({});
  const leftEndpointRefs = useRef({});
  const rightEndpointRefs = useRef({});
  const [activeDrag, setActiveDrag] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [lines, setLines] = useState([]);
  const [draftLine, setDraftLine] = useState(null);
  const score = useMemo(() => scoreLineMatching(activity, answers), [activity, answers]);

  const measureLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const nextLines = Object.entries(answers)
      .map(([leftId, rightId]) => {
        const leftEndpoint = leftEndpointRefs.current[leftId];
        const rightEndpoint = rightEndpointRefs.current[rightId];
        if (!leftEndpoint || !rightEndpoint) return null;
        return {
          leftId,
          rightId,
          from: centerForEndpoint(containerRect, leftEndpoint),
          to: centerForEndpoint(containerRect, rightEndpoint),
          state: submitted ? score.lineStates[leftId] || "incorrect" : "",
          color: colorForConnection(leftId, rightId),
        };
      })
      .filter(Boolean);

    setLines(nextLines);
  }, [answers, score.lineStates, submitted]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(measureLines);
    return () => cancelAnimationFrame(frame);
  }, [measureLines]);

  useEffect(() => {
    window.addEventListener("resize", measureLines);
    return () => window.removeEventListener("resize", measureLines);
  }, [measureLines]);

  const replaceMatch = (leftId, rightId) => {
    const nextAnswers = { ...answers };
    Object.entries(nextAnswers).forEach(([existingLeftId, existingRightId]) => {
      if (existingRightId === rightId) delete nextAnswers[existingLeftId];
    });
    nextAnswers[leftId] = rightId;
    onChange(nextAnswers);
  };

  const removeMatch = (leftId) => {
    playSound("clickConfirm");
    const nextAnswers = { ...answers };
    delete nextAnswers[leftId];
    onChange(nextAnswers);
  };

  const resetMatches = () => {
    playSound("clickConfirm");
    onChange({});
    setActiveDrag(null);
    setHoverTarget(null);
    setDraftLine(null);
  };

  const startLine = (event, side, itemId) => {
    if (submitted) return;
    playSound("dragStart");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const containerRect = containerRef.current.getBoundingClientRect();
    const endpoint = side === "left" ? leftEndpointRefs.current[itemId] : rightEndpointRefs.current[itemId];
    const from = centerForEndpoint(containerRect, endpoint);
    const to = { x: event.clientX - containerRect.left, y: event.clientY - containerRect.top };
    setActiveDrag({ side, itemId });
    setDraftLine({ from, to });
  };

  const moveLine = (event) => {
    if (!activeDrag || submitted) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    setDraftLine((current) => current ? {
      ...current,
      to: { x: event.clientX - containerRect.left, y: event.clientY - containerRect.top },
    } : null);

    const targetSide = activeDrag.side === "left" ? "right" : "left";
    const targetId = targetSide === "right"
      ? findItemAtPoint(activity.rightItems, rightRefs, event.clientX, event.clientY)
      : findItemAtPoint(activity.leftItems, leftRefs, event.clientX, event.clientY);
    setHoverTarget(targetId ? { side: targetSide, itemId: targetId } : null);
  };

  const finishLine = (event) => {
    if (!activeDrag || submitted) return;

    if (activeDrag.side === "left") {
      const targetRightId = findItemAtPoint(activity.rightItems, rightRefs, event.clientX, event.clientY);
      if (targetRightId) {
        replaceMatch(activeDrag.itemId, targetRightId);
        playSound("dropSuccess");
      } else {
        playSound("dropInvalid");
      }
    } else {
      const targetLeftId = findItemAtPoint(activity.leftItems, leftRefs, event.clientX, event.clientY);
      if (targetLeftId) {
        replaceMatch(targetLeftId, activeDrag.itemId);
        playSound("dropSuccess");
      } else {
        playSound("dropInvalid");
      }
    }

    setActiveDrag(null);
    setHoverTarget(null);
    setDraftLine(null);
  };

  return (
    <div
      ref={containerRef}
      className="line-matching-activity"
      onPointerMove={moveLine}
      onPointerUp={finishLine}
      onPointerCancel={finishLine}
    >
      <p className="activity-help-text">Drag from one box to another to make a match.</p>

      <svg className="matching-lines" aria-hidden="true">
        {lines.map((line) => (
          <ConnectionLine
            key={`${line.leftId}-${line.rightId}`}
            line={line}
          />
        ))}
        {draftLine && (
          <ConnectionLine line={{ ...draftLine, state: "" }} draft />
        )}
      </svg>

      {lines.map((line) => {
        const left = activity.leftItems.find((item) => item.id === line.leftId);
        const right = activity.rightItems.find((item) => item.id === line.rightId);
        if (!left || !right) return null;
        return (
          <ConnectionDeleteButton
            key={`delete-${line.leftId}-${line.rightId}`}
            line={line}
            leftLabel={left.label}
            rightLabel={right.label}
            disabled={submitted}
            onRemove={removeMatch}
          />
        );
      })}

      <div className="line-match-board">
        <div className="line-match-column left-column">
          {activity.leftItems.map((item, index) => (
            <MatchingNode
              key={item.id}
              item={item}
              side="left"
              active={hoverTarget?.side === "left" && hoverTarget.itemId === item.id}
              dragging={activeDrag?.side === "left" && activeDrag.itemId === item.id}
              connected={Boolean(answers[item.id])}
              submitted={submitted}
              state={score.lineStates[item.id] || (submitted ? "incorrect" : "")}
              nodeRef={(node) => {
                leftRefs.current[item.id] = node;
              }}
              endpointRef={(node) => {
                leftEndpointRefs.current[item.id] = node;
              }}
              onPointerDown={(event) => startLine(event, "left", item.id)}
            />
          ))}
        </div>

        <div className="line-match-column right-column">
          {activity.rightItems.map((item, index) => (
            <MatchingNode
              key={item.id}
              item={item}
              side="right"
              active={hoverTarget?.side === "right" && hoverTarget.itemId === item.id}
              dragging={activeDrag?.side === "right" && activeDrag.itemId === item.id}
              connected={Object.values(answers).includes(item.id)}
              submitted={submitted}
              nodeRef={(node) => {
                rightRefs.current[item.id] = node;
              }}
              endpointRef={(node) => {
                rightEndpointRefs.current[item.id] = node;
              }}
              onPointerDown={(event) => startLine(event, "right", item.id)}
              onPointerUp={finishLine}
            />
          ))}
        </div>
      </div>

      <div className="line-match-controls">
        <button type="button" data-sound-ignore="true" className="secondary-action compact-action" onClick={resetMatches} disabled={submitted}>
          <RotateCcw size={16} /> Reset matches
        </button>
      </div>

      {submitted && (
        <div className={`item-feedback-box line-feedback ${score.mistakes.length ? "wrong" : "correct"}`}>
          {score.mistakes.length
            ? activity.feedback?.wrong || activity.feedback?.revision || score.revisionGuidance
            : activity.feedback?.correct || "Good job. Your matches are correct."}
          {score.mistakes.length > 0 && (
            <span>{activity.feedback?.revision || score.revisionGuidance}</span>
          )}
        </div>
      )}
    </div>
  );
}
