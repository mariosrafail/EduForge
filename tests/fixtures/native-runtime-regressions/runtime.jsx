import "../../../src/data/native-activities/nativeOpenResponse.js";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TeacherFixedStage from "../../../src/apps/android-teacher-offline/TeacherFixedStage.jsx";
import "../../../src/apps/android-teacher-offline/teacherFixedStage.css";
import { NativeDragDropStudentSurface } from "../../../src/components/native-drag-drop/NativeDragDropSurface.jsx";
import { NativeOldschoolListeningSurface } from "../../../src/components/native-oldschool-listening/NativeOldschoolListeningSurface.jsx";
import { NativeReadableTextPresentation } from "../../../src/components/native-readable-text/NativeReadableTextPresentation.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../src/components/native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { createNativeOpenResponseQuestion } from "../../../src/data/native-activities/nativeOpenResponse.js";
import { nativeDocumentPair } from "../../../scripts/book-builder/hosted-native-activity-document-fixtures.mjs";

const drag = nativeDocumentPair("runtime-drag", "drag-drop", "page-1", "Drag regression").publicDocument;
drag.parts[0].interaction.words = [{ id: "word-1", text: "A deliberately long\nmultiline classroom label", reusable: true }];
drag.parts[0].interaction.panels = [{ id: "panel-1", surface: { width: 1024, height: 582 }, images: [], dropTargets: [{ id: "target-1", area: { x: 100, y: 100, width: 350, height: 100 }, capacity: 1, accessibleLabel: "Drop here" }] }];
const listening = nativeDocumentPair("runtime-listening", "oldschool-listening", "page-1", "Listening regression").publicDocument;
listening.assets = [{ slot: "audio", assetId: "audio" }, { slot: "page", assetId: "page" }];
Object.assign(listening.parts[0].interaction, { audioAssetSlot: "audio", audioDurationMs: 20000, cues: Array.from({ length: 10 }, (_, index) => ({ id: `cue-${index}`, startMs: index * 1500, endMs: (index + 1) * 1500, text: `Line ${index}`, scrollY: null, highlightRegions: [{ id: `region-${index}`, x: 60, y: index * 420 + 50, width: 700, height: 80 }] })) });
Object.assign(listening.parts[0].interaction.panels[1], { pageAssetSlot: "page", sourceHeight: 4400, altText: "Tall listening page" });
const assetUrl = (id) => id === "audio" ? "/src/assets/books/ultimate-b2/teacher-offline-media/unit-1-television-dialogue.mp3" : "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="4400"><rect width="1024" height="4400" fill="ivory"/></svg>');
const typography = nativeDocumentPair("runtime-typography", "open-response", "page-1", "Typography regression");
const question = createNativeOpenResponseQuestion("q-10000000000040008000000000000001");
question.prompt = "First prompt\n\nThird prompt";
Object.assign(question.responseRegion.presentation, { answerSizeMode: "authored", answerFontSizeMax: 100 });
typography.publicDocument.parts[0].interaction.questions = [question];
typography.teacherDocument.parts[0].solution.modelAnswers = [{ questionId: question.id, text: "A\n\nB" }];
function Fixture() {
  const [scale, setScale] = useState(.65);
  const [kind, setKind] = useState("drag");
  const [version, setVersion] = useState(0);
  globalThis.fixture = { setScale, setKind, rerender: () => setVersion((value) => value + 1), setScrollTarget: (index, scrollY) => { listening.parts[0].interaction.cues[index].scrollY = scrollY; setVersion((value) => value + 1); } };
  const document = structuredClone(kind === "typography" ? typography.publicDocument : ["drag", "audio"].includes(kind) ? drag : listening);
  if (kind === "audio") { document.assets = listening.assets; document.supplementalAudio = { assetSlot: "audio", durationMs: 20000, reference: { assetSlot: "page", sourceWidth: 1024, sourceHeight: 4400, altText: "Reference" } }; }
  return <TeacherFixedStage viewport={{ displayScale: scale, width: 1920 * scale, height: 1080 * scale, offsetLeft: 0, offsetTop: 0 }}><div className="teacher-offline-page-stage has-embedded-activity" style={{ width: 1024, height: 582, position: "relative", margin: 40 }} data-version={version}><NativeReadableTextPresentation document={document} assetUrl={assetUrl}>{kind === "typography" ? <NativeOpenResponseTeacherSurface publicDocument={document} teacherDocument={typography.teacherDocument} assetUrl={assetUrl} /> : ["drag", "audio"].includes(kind) ? <NativeDragDropStudentSurface document={document} /> : <NativeOldschoolListeningSurface publicDocument={document} assetUrl={assetUrl} renderQuestions={() => <p>Questions</p>} />}</NativeReadableTextPresentation></div></TeacherFixedStage>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
