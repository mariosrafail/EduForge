import "../../../src/data/native-activities/nativeOpenResponse.js";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NativeDragDropStudentSurface } from "../../../src/components/native-drag-drop/NativeDragDropSurface.jsx";
import { NativeDragDropTeacherSurface } from "../../../src/components/native-drag-drop/NativeDragDropTeacherSurface.jsx";
import { nativeDocumentPair } from "../../../scripts/book-builder/hosted-native-activity-document-fixtures.mjs";

const pair = nativeDocumentPair("image-items", "drag-drop", "page-1", "Image item regression");
const id = (prefix, n) => `${prefix}-1000000000004000800000000000000${n}`;
pair.publicDocument.assets = [{ assetId: "10000000-0000-4000-8000-000000000001", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "tick" }];
pair.publicDocument.parts[0].interaction.words = [
  { id: id("word", 1), text: "Tick", shortLabel: "A", reusable: true, image: { assetSlot: "tick", sourceWidth: 48, sourceHeight: 64, displayWidth: 48, displayHeight: 64 } },
  { id: id("word", 2), text: "No", shortLabel: "B", reusable: false },
];
pair.publicDocument.parts[0].interaction.panels = [1, 2].map((n) => ({ id: id("panel", n), surface: { width: 1024, height: 582 }, images: [], dropTargets: [{ id: id("target", n), area: { x: 100, y: 80, width: 200, height: 100 }, capacity: 1, accessibleLabel: `Target ${n}` }] }));
pair.teacherDocument.parts[0].solution.mappings = [1, 2].map((n) => ({ targetId: id("target", n), wordIds: [id("word", 1)] }));
const assetUrl = () => "/synthetic-managed-tick.png";
function Fixture() {
  const [responses, setResponses] = useState({});
  const [otherResponses, setOtherResponses] = useState({});
  const [readOnly, setReadOnly] = useState(false);
  const [teacher, setTeacher] = useState(false);
  const [text, setText] = useState(false);
  const [scale, setScale] = useState(1);
  globalThis.imageItems = { setReadOnly, setTeacher, setText, setScale, responses, otherResponses };
  const document = { ...pair.publicDocument, parts: [{ ...pair.publicDocument.parts[0], interaction: { ...pair.publicDocument.parts[0].interaction, layoutMode: text ? "text" : "standard" } }] };
  return <div style={{ display: "flex", gap: 20, transform: `scale(${scale})`, transformOrigin: "top left" }}>
    <div data-owner="first" style={{ width: 700, height: 450, flexShrink: 0 }}>{teacher ? <NativeDragDropTeacherSurface publicDocument={document} teacherDocument={pair.teacherDocument} assetUrl={assetUrl} /> : <NativeDragDropStudentSurface document={document} responses={responses} onResponsesChange={setResponses} readOnly={readOnly} assetUrl={assetUrl} />}</div>
    <div data-owner="second" style={{ width: 700, height: 450, flexShrink: 0 }}><NativeDragDropStudentSurface document={{ ...document, activityId: "second-image-items" }} responses={otherResponses} onResponsesChange={setOtherResponses} assetUrl={assetUrl} /></div>
  </div>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
