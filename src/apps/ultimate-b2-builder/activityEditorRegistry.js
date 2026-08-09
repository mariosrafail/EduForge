import { UltimateB2ListeningBuilder } from "./UltimateB2ListeningBuilder.jsx";
import { UltimateB2MultipleChoiceBuilder } from "./UltimateB2MultipleChoiceBuilder.jsx";
import { UltimateB2OpenResponseBuilder } from "./UltimateB2OpenResponseBuilder.jsx";
import { UltimateB2PublisherDisplayBuilder } from "./UltimateB2PublisherDisplayBuilder.jsx";
import { UltimateB2VideoBuilder } from "./UltimateB2VideoBuilder.jsx";
import { ultimateB2ActivityEditorMetadata } from "./activityEditorMetadata.js";

export { ultimateB2ActivityEditorMetadata } from "./activityEditorMetadata.js";

export const ultimateB2ActivityEditorRegistry = Object.freeze({
  "ultimate-b2-sb-u1-p1-o1": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p1-o1"], component: UltimateB2OpenResponseBuilder }),
  "ultimate-b2-sb-u1-p1-o2": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p1-o2"], component: UltimateB2PublisherDisplayBuilder }),
  "ultimate-b2-sb-u1-p2-o1": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o1"], component: UltimateB2VideoBuilder }),
  "ultimate-b2-sb-u1-p2-o2": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o2"], component: UltimateB2ListeningBuilder }),
  "ultimate-b2-sb-u1-p2-o3": Object.freeze({ ...ultimateB2ActivityEditorMetadata["ultimate-b2-sb-u1-p2-o3"], component: UltimateB2MultipleChoiceBuilder }),
});
