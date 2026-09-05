import "../../../src/data/native-activities/nativeOpenResponse.js";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NativeMultiPartStudentSurface } from "../../../src/components/native-multi-part/NativeMultiPartStudentSurface.jsx";
import { NativeMultiPartTeacherSurface } from "../../../src/components/native-multi-part/NativeMultiPartTeacherSurface.jsx";
import { NativeImageTeacherPresentation } from "../../../src/components/native-image/NativeImageTeacherPresentation.jsx";
import { NativeMultiPartEditor } from "../../../src/apps/book-builder/hosted/NativeMultiPartEditor.jsx";
import { createMultiPartSection } from "../../../src/apps/book-builder/hosted/nativeMultiPartAuthoring.js";
import { normalizeNativeMultiPartInteraction, validateNativeMultiPartTopology } from "../../../src/data/native-activities/nativeMultiPart.js";
import { NATIVE_DRAG_DROP_DEFAULT_PRESENTATION } from "../../../src/data/native-activities/nativeDragDrop.js";
import { publicDocument, teacherDocument, imageDocument, imageTeacher } from "./multi-part-data.js";
function Fixture() {
  const [multiSample, setMultiSample] = useState(false); const [responses, setResponses] = useState({}); const [teacher, setTeacher] = useState(false); const [readOnly, setReadOnly] = useState(false); const [scale, setScale] = useState(1); const [sample, setSample] = useState(false); const [editor, setEditor] = useState(false);
  globalThis.multiFixture = { responses, setMultiSample, setTeacher, setReadOnly, setScale, setSample, setEditor, publicDocument, teacherDocument };
  const scopedTeacher = multiSample ? structuredClone(teacherDocument) : teacherDocument;
  if (multiSample) scopedTeacher.parts[0].solution.sections.find((section) => section.kind === "image").solution.sampleAnswer = imageTeacher.parts[0].solution.sampleAnswer;
  const assetUrl = () => "/synthetic-shared.png";
  return <div style={{ width: 1100, padding: 20, transform: `scale(${scale})`, transformOrigin: "top left" }}>
    <button type="button" onClick={() => globalThis.document.getElementById("root").requestFullscreen()}>Fullscreen fixture</button>
    {editor ? <NativeMultiPartEditor bookSlug="ultimate-b2" componentSlug="ultimate-b2-students-book" activityId={publicDocument.activityId} /> : sample ? <div style={{ width: 700, height: 450 }}><NativeImageTeacherPresentation document={imageDocument} teacherDocument={imageTeacher} assetUrl={assetUrl} teacherAssetUrl={() => "/protected-answer.png"} /></div> : teacher ? <NativeMultiPartTeacherSurface publicDocument={publicDocument} teacherDocument={scopedTeacher} teacherAssetUrl={() => "/protected-answer.png"} assetUrl={assetUrl} /> : <NativeMultiPartStudentSurface document={publicDocument} assetUrl={assetUrl} responses={responses} onResponsesChange={setResponses} readOnly={readOnly} />}
  </div>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
