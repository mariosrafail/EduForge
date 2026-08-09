import { UltimateB2CompleteSentencesBuilder } from "./UltimateB2CompleteSentencesBuilder.jsx";
import { UltimateB2DebateClubBuilder } from "./UltimateB2DebateClubBuilder.jsx";
import { UltimateB2ImageBuilder } from "./UltimateB2ImageBuilder.jsx";
import { UltimateB2ListeningBuilder } from "./UltimateB2ListeningBuilder.jsx";
import { UltimateB2MultipleChoiceBuilder } from "./UltimateB2MultipleChoiceBuilder.jsx";
import { UltimateB2OpenResponseBuilder } from "./UltimateB2OpenResponseBuilder.jsx";
import { UltimateB2VideoBuilder } from "./UltimateB2VideoBuilder.jsx";
import { ultimateB2ActivityEditorMetadata } from "./activityEditorMetadata.js";

export { ultimateB2ActivityEditorMetadata } from "./activityEditorMetadata.js";

export const ultimateB2ActivityEditorRegistry = Object.freeze({
  "ultimate-b2-sb-u1-p1-o1": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p1-o1"], component: UltimateB2OpenResponseBuilder }),
  "ultimate-b2-sb-u1-p1-o2": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p1-o2"], component: UltimateB2ImageBuilder }),
  "ultimate-b2-sb-u1-p2-o1": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o1"], component: UltimateB2VideoBuilder }),
  "ultimate-b2-sb-u1-p2-o2": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o2"], component: UltimateB2ListeningBuilder }),
  "ultimate-b2-sb-u1-p2-o3": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o3"], component: UltimateB2MultipleChoiceBuilder }),
  "ultimate-b2-sb-u1-p2-o4": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o4"], component: UltimateB2CompleteSentencesBuilder }),
  "ultimate-b2-sb-u1-p2-o5": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o5"], component: UltimateB2DebateClubBuilder }),
});
