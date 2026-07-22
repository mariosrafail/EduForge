import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeIwbXml } from "./iwb-inspector.mjs";
import { writeDeterministicJson } from "./students-book-scanner.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source-root");
const sourceRoot = path.resolve(sourceIndex >= 0
  ? args[sourceIndex + 1]
  : process.env.ULTIMATE_B2_SOURCE_ROOT || path.join(repoRoot, "Ultimate English B2.app"));
const generatedRoot = path.join(repoRoot, "books/ultimate-b2/generated");
const outputRoot = path.join(generatedRoot, "editorial");
const frontendOutput = path.join(repoRoot, "src/data/ultimate-b2/generated/unit-02.runtime.json");
const migrationOutput = path.join(repoRoot, "database/020_ultimate_b2_unit2_recovered_activities.sql");
const publisherRoot = "Contents/Resources/assets/books/book1/unit/2";

const allowedModes = new Set([
  "auto-scored",
  "teacher-reviewed",
  "unscored-practice",
  "media-interaction",
  "reading-content",
  "unsupported-disabled",
]);

const sectionByPart = new Map([
  [1, "Unit opener"], [2, "Reading"], [3, "Vocabulary in Use"], [4, "Grammar in Use"],
  [5, "Listening"], [6, "Speaking"], [7, "Writing"], [8, "Review 2"],
  [9, "Practice 2"], [10, "Practice 2"], [11, "Progress check 1"], [12, "Progress check 1"],
]);

const exerciseById = {
  "p1-o1": "1",
  "p2-o1": "1", "p2-o2": "2", "p2-o3": "3", "p2-o4": "4", "p2-o5": null,
  "p3-o1": "1", "p3-o2": "2", "p3-o3": "3", "p3-o4": "4", "p3-o5": "5", "p3-o6": "6", "p3-o7": "7",
  "p4-o1": "1", "p4-o3": "3", "p4-o4": "4", "p4-o6": "6", "p4-o7": "7", "p4-o8": "8",
  "p5-o1": "1", "p5-o2": "2", "p5-o3": "3", "p5-o4": "4",
  "p6-o1": "1", "p6-o2": "2", "p6-o5": "3",
  "p7-o2": "1", "p7-o3": "2", "p7-o4": "3", "p7-o5": "4", "p7-o6": "5", "p7-o7": "6", "p7-o8": "7", "p7-o9": "8", "p7-o10": "9",
  "p8-o1": "Vocabulary", "p8-o2": "Grammar", "p8-o3": "Game 1", "p8-o4": "Game 2",
  "p9-o1": "1", "p10-o1": "2", "p10-o3": "3",
  "p11-o1": "1", "p11-o2": "2", "p11-o3": "3", "p11-o4": "4",
  "p12-o1": "1", "p12-o2": "2", "p12-o3": "3", "p12-o4": "4",
};

const instructionsById = {
  "p1-o1": "Read the quote and discuss these questions with a partner.",
  "p2-o1": "Watch the video and answer the questions.",
  "p2-o2": "Listen and read the text. Then discuss the questions with a partner.",
  "p2-o3": "Read the text again and insert the missing sentences. There is one extra sentence which you do not need to use.",
  "p2-o4": "Circle the correct words.",
  "p2-o5": "With your partner, discuss the question. Use the ideas given and add your own. Then take turns to present your arguments.",
  "p3-o1": "Read and complete the text with the words in the box.",
  "p3-o2": "Complete the expressions with the words in the box. Then use the expressions to complete the sentences.",
  "p3-o3": "Complete the sentences with the words in the box.",
  "p3-o4": "Complete the sentences with the correct prepositions.",
  "p3-o5": "Complete the chart. Then complete the sentences with words from the chart.",
  "p3-o6": "Complete the sentences with the words in the box.",
  "p3-o7": "Complete the text with the correct form of the words given.",
  "p4-o1": "Watch the video and answer the questions.",
  "p4-o3": "Complete the text with the past simple or the past continuous of the verbs in brackets.",
  "p4-o4": "Read and circle the correct answers.",
  "p4-o6": "Complete the sentences with the past perfect simple or the past perfect continuous of the verbs in brackets.",
  "p4-o7": "Complete the dialogue by circling the correct answers.",
  "p4-o8": "Complete the second sentence so that it means the same as the first, using the word given. Do not change the word. Use between two and five words.",
  "p5-o1": "Look at the pictures. How much do you know about Iceland? Read and circle T (true) or F (false).",
  "p5-o2": "Read the text about fjords and answer the questions.",
  "p5-o3": "Listen and read the text about fjords. Were your predictions correct?",
  "p5-o4": "Look at the gaps in questions 1–10 and try to predict the missing words. Then listen and complete the sentences with a word or short phrase.",
  "p6-o1": "Look at the two photos. Find similarities and differences between them.",
  "p6-o2": "Listen to a student comparing the photos. Then complete the missing words.",
  "p6-o5": "Work with your partner to compare the photos. Use the words and phrases in the Language checklist to help you.",
  "p7-o2": "Read the writing task and answer the questions.",
  "p7-o3": "Read the model story and complete it with the time and sequence words and phrases.",
  "p7-o4": "Read the model story again and answer the questions.",
  "p7-o5": "Read the model story again and circle the correct words.",
  "p7-o6": "Read the model story again and underline the verbs that describe how people or things move. Then write them here.",
  "p7-o7": "Replace the words in bold with the correct form of a descriptive verb from the Language checklist.",
  "p7-o8": "Read the writing task and answer the questions.",
  "p7-o9": "Read these opening sentences of stories and choose the sentence which follows on from them logically. Why are the other options wrong?",
  "p7-o10": "Complete the paragraph plan and write the story.",
  "p8-o1": "Choose the correct answers.", "p8-o2": "Choose the correct answers.",
  "p8-o3": "Legacy team game.", "p8-o4": "Legacy team game.",
  "p9-o1": "Read the text and insert the missing sentences. There is one extra sentence which you do not need to use.",
  "p10-o1": "For questions 1–8, read the text and think of the word which best fits each gap. Use only one word in each gap.",
  "p10-o3": "Listen to the interview and complete the sentences with a word or short phrase.",
  "p11-o1": "Complete the sentences with the correct form of these phrasal verbs.",
  "p11-o2": "Match. Then complete the sentences with the correct words.",
  "p11-o3": "Complete the sentences with the correct adjective form of the words given.",
  "p11-o4": "Read and circle the correct words.",
  "p12-o1": "Circle the correct answers.",
  "p12-o2": "Read and complete the text. Write one word in each gap.",
  "p12-o3": "Complete. Use the past perfect simple or the past perfect continuous.",
  "p12-o4": "Complete the second sentence so that it means the same as the first, using the word given. Do not change the word. Use between two and five words.",
};

const requestedModes = new Map();
function setModes(ids, mode) { ids.split(/\s+/).filter(Boolean).forEach((id) => requestedModes.set(id, mode)); }
setModes("p2-o3 p2-o4 p3-o1 p3-o2 p3-o3 p3-o4 p3-o5 p3-o6 p3-o7 p4-o1 p4-o3 p4-o6 p4-o8 p5-o2 p5-o3 p5-o4 p6-o2 p7-o3 p7-o7 p9-o1 p10-o1 p10-o3 p11-o1 p11-o2 p11-o3 p12-o2 p12-o3 p12-o4", "auto-scored");
setModes("p1-o1 p2-o1 p2-o5 p7-o2 p7-o4 p7-o6 p7-o8 p7-o9 p7-o10", "teacher-reviewed");
setModes("p6-o1 p6-o5", "unscored-practice");
setModes("p2-o2", "reading-content");
setModes("p4-o4 p4-o7 p5-o1 p7-o5 p8-o1 p8-o2 p8-o3 p8-o4 p11-o4 p12-o1", "unsupported-disabled");

const mediaById = {
  "p2-o1": [{ type: "video", logicalKey: "ultimate-b2.students-book.unit-2.reading.video-intro", sourceRelativePath: "Contents/Resources/assets/videos/book1/unit/2/part2/obj1.mp4", localDevelopmentPath: "/src/assets/books/ultimate-b2/media/unit_2_reading_video.mp4" }],
  "p2-o2": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-2.reading.text-audio", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/part2/obj2/audio.mp3", localDevelopmentPath: "/src/assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3" }],
  "p4-o1": [{ type: "video", logicalKey: "ultimate-b2.students-book.unit-2.grammar.video-intro", sourceRelativePath: "Contents/Resources/assets/videos/book1/unit/2/part4/obj1.mp4", localDevelopmentPath: "/Ultimate%20English%20B2.app/Contents/Resources/assets/videos/book1/unit/2/part4/obj1.mp4" }],
  "p5-o3": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-2.listening.fjords", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3", localDevelopmentPath: "/Ultimate%20English%20B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3" }],
  "p5-o4": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-2.listening.iceland-trip", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/part5/obj4/audio.mp3", localDevelopmentPath: "/Ultimate%20English%20B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj4/audio.mp3" }],
  "p6-o2": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-2.speaking.photo-comparison", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/part6/obj2/audio.mp3", localDevelopmentPath: "/Ultimate%20English%20B2.app/Contents/Resources/assets/books/book1/unit/2/part6/obj2/audio.mp3" }],
  "p10-o3": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/part10/obj3/audio.mp3", localDevelopmentPath: "/Ultimate%20English%20B2.app/Contents/Resources/assets/books/book1/unit/2/part10/obj3/audio.mp3" }],
};

const manualPromptsById = {
  "p1-o1": [
    "Do you believe that time travel is possible? Why/Why not?",
    "Which time period in history would you choose to travel to? Why?",
    "What would you change if you travelled back or forward in time?",
  ],
  "p2-o1": [
    "What has the Bermuda Triangle always been associated with?",
    "What is similar in all the stories of planes and ships disappearing?",
  ],
  "p2-o5": ["Time travel is impossible. Agree or disagree?"],
  "p6-o1": ["Similarities", "Differences"],
  "p6-o5": [
    "Compare the two photos.",
    "Why have the people chosen to spend their holidays in these places?",
    "Which of these two places would you most enjoy visiting?",
  ],
  "p7-o2": [
    "What kind of text do you have to write, and how will it start?",
    "What two things must you include?",
    "Where was Rick going with his rucksack?",
  ],
  "p7-o6": ["Then write them here."],
  "p7-o8": [
    "What kind of text do you have to write, and how will it start?",
    "What two things must you include?",
    "Where do you think Olivia is?",
    "What do you think she is going to do next?",
  ],
  "p7-o9": [
    "Opening 1: choose the sentence which follows logically and explain why the other options are wrong.",
    "Opening 2: choose the sentence which follows logically and explain why the other options are wrong.",
    "Opening 3: choose the sentence which follows logically and explain why the other options are wrong.",
  ],
  "p7-o10": ["Write your story. (140–190 words)"],
};

const autoPromptOverridesById = {
  "p3-o2": ["suffer", "take", "wait", "book", "cancel"],
  "p9-o1": [
    "Gap 1 in the reading text", "Gap 2 in the reading text", "Gap 3 in the reading text",
    "Gap 4 in the reading text", "Gap 5 in the reading text", "Gap 6 in the reading text",
  ],
  "p11-o2": ["air", "costume", "emergency", "film", "media", "package", "traffic", "travel"],
};

const letterOptionTextById = {
  "p3-o2": {
    a: "a cruise / a trip / a break / your time",
    b: "for a bus / for a train / for a taxi",
    c: "on holiday / on a journey / by air / sightseeing",
    d: "a hotel room / a package holiday / a ticket",
    e: "a reservation / a flight / accommodation",
    f: "from jetlag / from travel sickness",
  },
  "p9-o1": {
    A: "Some even believe there are alien civilisations down there.",
    B: "Despite there being no reports of bad weather in the area, all five planes vanished and the crews were lost.",
    C: "Although we now have sophisticated diving equipment, that did not use to be the case.",
    D: "Others have suggested that methane gas rising from the ocean floor stops GPS equipment from working properly.",
    E: "Furthermore, they say, thousands of planes and ships make it through the area without incident.",
    F: "In addition, he said he saw a light moving up and down above the sea.",
    G: "On the contrary, the last known message simply stated that all was well and the weather was good.",
  },
  "p11-o2": {
    a: "crew", b: "designer", c: "holiday", d: "jam", e: "landing", f: "sickness", g: "space", h: "streaming",
  },
};

function toArray(value) { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function collectByKey(value, key, results = []) {
  if (!value || typeof value !== "object") return results;
  for (const [name, child] of Object.entries(value)) {
    if (name === key) results.push(...toArray(child));
    if (child && typeof child === "object") collectByKey(child, key, results);
  }
  return results;
}
function sourceText(value) { return typeof value === "string" ? value : typeof value?.["#text"] === "string" ? value["#text"] : ""; }
function cleanText(value) {
  return sourceText(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replace(/_{3,}/g, "____")
    .replace(/\s+/g, " ")
    .trim();
}
function compactId(activity) { return `p${activity.partNumber}-o${activity.activityOrder}`; }
function sourcePathFor(activity, file = "obj_params.iwb") { return `${publisherRoot}/part${activity.partNumber}/obj${activity.activityOrder}/${file}`; }
async function sourceExists(relativePath, root = sourceRoot) {
  try { await access(path.join(root, relativePath)); return true; } catch { return false; }
}

function promptGroups(document) {
  const nodes = collectByKey(document, "text")
    .filter((node) => sourceText(node) && !node["@_answers"] && (node["@_x"] !== undefined || node["@_pagesIndex"] !== undefined))
    .sort((left, right) => Number(left["@_pagesIndex"] || 1) - Number(right["@_pagesIndex"] || 1)
      || Number(left["@_y"] || 0) - Number(right["@_y"] || 0)
      || Number(left["@_x"] || 0) - Number(right["@_x"] || 0));
  const groups = [];
  for (const node of nodes) {
    const raw = sourceText(node);
    const markerPattern = /(?:\(\s*)?<b>\s*\(?(\d{1,2})\)?\s*<\/b>\s*\)?/gi;
    const markers = [...raw.matchAll(markerPattern)];
    if (markers.length) {
      markers.forEach((marker, index) => {
        const end = markers[index + 1]?.index ?? raw.length;
        const text = cleanText(raw.slice(marker.index, end));
        groups.push({ printedNumber: Number(marker[1]), pageIndex: Number(node["@_pagesIndex"] || 1), text, source: "decoded-obj-params-text" });
      });
      continue;
    }
    const text = cleanText(node);
    if (groups.length && !/^_{3,}$/.test(text) && text) groups.at(-1).text = `${groups.at(-1).text} ${text}`.replace(/\s+/g, " ").trim();
  }
  return groups;
}

function decodedAnswerRows(document) {
  const rows = [];
  for (const exercise of collectByKey(document, "exercise")) {
    const type = exercise["@_type"] || "unknown";
    const pageIndex = Number(exercise["@_pagesIndex"] || 1);
    if (["write", "sa"].includes(type)) {
      for (const sentence of toArray(exercise.sentences?.sentence)) {
        const answerNode = toArray(sentence.text).find((text) => text?.["@_answers"]);
        if (!answerNode) continue;
        const acceptedAnswers = String(answerNode["@_answers"]).split("|").map((answer) => cleanText(answer)).filter(Boolean);
        rows.push({ sourceType: type, pageIndex, acceptedAnswers, publisherValue: answerNode["@_answers"] });
      }
    }
    if (["dnd", "dndCat"].includes(type)) {
      const drags = toArray(exercise.drags?.drag);
      const dragById = new Map(drags.map((drag) => [String(drag["@_id"]), cleanText(drag)]));
      const options = [...new Set(drags.map(cleanText).filter(Boolean))];
      for (const drop of toArray(exercise.drops?.drop)) {
        const publisherIds = String(drop["@_answers"] || "").split(",").map((id) => id.trim()).filter(Boolean);
        const acceptedAnswers = publisherIds.map((id) => dragById.get(id)).filter(Boolean);
        rows.push({ sourceType: type, pageIndex, acceptedAnswers, options, publisherValue: drop["@_answers"] });
      }
    }
  }
  return rows;
}

function runtimeFromCuratedActivity(activity) {
  const answerByQuestion = new Map((activity.answerRecords || []).map((record) => [record.questionId, record]));
  return (activity.questions || []).map((question, index) => {
    const answer = answerByQuestion.get(question.id);
    const options = (question.options || []).map((option) => ({ id: option.id, text: option.value }));
    const acceptedAnswers = (answer?.optionIds || []).map((id) => options.find((option) => option.id === id)?.text).filter(Boolean);
    return { id: question.id, number: index + 1, prompt: question.prompt, options, acceptedAnswers, sourceType: activity.activityType };
  });
}

function buildRuntimeQuestions(activity, document, mode) {
  if (["ultimate-b2-sb-u2-p2-o3", "ultimate-b2-sb-u2-p2-o4"].includes(activity.id)) return runtimeFromCuratedActivity(activity);
  const shortId = compactId(activity);
  const groups = promptGroups(document);
  const manualPrompts = manualPromptsById[shortId] || [];
  if (mode === "teacher-reviewed") {
    const prompts = manualPrompts.length ? manualPrompts : groups.map((group) => group.text);
    return prompts.map((prompt, index) => ({ id: `${activity.id}-q${index + 1}`, number: index + 1, prompt, options: [], acceptedAnswers: [], sourceType: "open-response" }));
  }
  if (mode === "unscored-practice") {
    const prompts = groups.length ? groups.map((group) => group.text) : manualPrompts;
    return prompts.map((prompt, index) => ({ id: `${activity.id}-q${index + 1}`, number: index + 1, prompt, options: [], acceptedAnswers: [], sourceType: "practice-prompt" }));
  }
  const answers = decodedAnswerRows(document);
  const letterOptions = letterOptionTextById[shortId] || null;
  if (letterOptions) {
    for (const answer of answers.filter((item) => item.sourceType === "dnd")) {
      answer.options = Object.values(letterOptions);
      answer.acceptedAnswers = answer.acceptedAnswers.map((value) => letterOptions[value]).filter(Boolean);
    }
  }
  const alignedGroups = [];
  for (const pageIndex of [...new Set(answers.map((answer) => answer.pageIndex))]) {
    const pageAnswers = answers.filter((answer) => answer.pageIndex === pageIndex);
    const pageGroups = groups.filter((group) => group.pageIndex === pageIndex);
    alignedGroups.push(...pageGroups.slice(Math.max(0, pageGroups.length - pageAnswers.length)));
  }
  const promptOverrides = autoPromptOverridesById[shortId] || [];
  return answers.map((answer, index) => ({
    id: `${activity.id}-q${index + 1}`,
    number: index + 1,
    prompt: promptOverrides[index] || alignedGroups[index]?.text || null,
    options: (answer.options || []).map((text, optionIndex) => ({ id: `${activity.id}-q${index + 1}-o${optionIndex + 1}`, text })),
    acceptedAnswers: answer.acceptedAnswers,
    sourceType: answer.sourceType,
    publisherAnswerValue: String(answer.publisherValue || ""),
  }));
}

async function decodeActivity(activity, root = sourceRoot) {
  const candidates = ["obj_params.iwb", "ebook_obj_params.iwb", "questions_params.iwb"];
  const decoded = [];
  for (const file of candidates) {
    const relative = sourcePathFor(activity, file);
    try {
      decoded.push({ relative, ...decodeIwbXml(await readFile(path.join(root, relative))) });
    } catch (error) {
      if (error.code !== "ENOENT") decoded.push({ relative, error: error.message });
    }
  }
  return decoded;
}

function visualProvenance(activity) {
  return `${publisherRoot}/parts/HD/parts_part_${activity.partNumber}.png`;
}

function implementationTitle(activity, visibleExerciseNumber) {
  const section = sectionByPart.get(activity.partNumber) || `Part ${activity.partNumber}`;
  if (!visibleExerciseNumber) return section;
  if (/^\d+$/.test(String(visibleExerciseNumber))) return `${section} · Exercise ${visibleExerciseNumber}`;
  return `${section} · ${visibleExerciseNumber}`;
}

export async function buildUnit02ImplementationMatrix({ activities, source = sourceRoot } = {}) {
  if (!activities) {
    const catalog = JSON.parse(await readFile(path.join(generatedRoot, "activities/unit-02.activities.json"), "utf8"));
    activities = catalog.activities;
  }
  const records = [];
  for (const activity of activities) {
    const shortId = compactId(activity);
    let mode = requestedModes.get(shortId) || "unsupported-disabled";
    if (!allowedModes.has(mode)) throw new Error(`Invalid implementation mode for ${shortId}: ${mode}`);
    const decoded = await decodeActivity(activity, source);
    const primary = decoded.find((entry) => entry.relative.endsWith("obj_params.iwb") && !entry.error)?.document || null;
    const runtimeQuestions = primary ? buildRuntimeQuestions(activity, primary, mode) : [];
    const warnings = decoded.filter((entry) => entry.error).map((entry) => `${entry.relative}: ${entry.error}`);
    if (mode === "auto-scored" && (!runtimeQuestions.length || runtimeQuestions.some((question) => !question.prompt || !question.acceptedAnswers.length))) {
      warnings.push("Auto-scoring withheld because at least one prompt or explicit answer could not be paired deterministically.");
      mode = "unsupported-disabled";
    }
    if (["teacher-reviewed", "unscored-practice"].includes(mode) && !runtimeQuestions.length) {
      warnings.push("Interactive prompt text was not recoverable from structured metadata; the page image remains the only complete representation.");
      mode = "unsupported-disabled";
    }
    const enabled = mode !== "unsupported-disabled";
    const visibleExerciseNumber = exerciseById[shortId] ?? null;
    const sourceProvenance = [...new Set([
      ...activity.sourceProvenance,
      ...decoded.filter((entry) => !entry.error).map((entry) => entry.relative),
      visualProvenance(activity),
    ])].sort();
    const mediaDependencies = [...(mediaById[shortId] || []), ...(activity.mediaDependencies || []).map((dependency) => ({
      type: dependency.type,
      sourceRelativePath: dependency.id,
      required: dependency.required,
    }))];
    for (const dependency of mediaDependencies) {
      if (dependency.sourceRelativePath) dependency.sourceExistsAtGeneration = await sourceExists(dependency.sourceRelativePath, source);
    }
    records.push({
      stableNormalizedId: activity.id,
      publisherObjectId: `part${activity.partNumber}/obj${activity.activityOrder}`,
      unitNumber: 2,
      partNumber: activity.partNumber,
      printedPage: activity.physicalPageNumber,
      printedSpread: activity.spread,
      sourceInteractionType: activity.publisherInteractionTypes,
      visibleExerciseNumber,
      title: implementationTitle(activity, visibleExerciseNumber),
      visibleInstructionText: instructionsById[shortId] || null,
      questionPromptText: runtimeQuestions.map((question) => question.prompt),
      optionText: runtimeQuestions.map((question) => question.options.map((option) => option.text)),
      explicitAnswerEvidence: runtimeQuestions.map((question) => ({
        questionId: question.id,
        publisherValue: question.publisherAnswerValue || null,
        acceptedAnswers: question.acceptedAnswers,
        source: question.acceptedAnswers.length ? `${sourcePathFor(activity)}#decoded-explicit-answer` : null,
      })),
      mediaDependencies,
      imageDependencies: activity.imageDependencies,
      requiredLearnerInteraction: mode === "auto-scored" ? runtimeQuestions.some((question) => question.options.length) ? "select or match the explicit response" : "enter a short response"
        : mode === "teacher-reviewed" ? "enter and submit an open response"
          : mode === "unscored-practice" ? "read and reflect or discuss"
            : mode === "reading-content" ? "read and optionally play the related audio"
              : "none",
      scoringMode: mode === "auto-scored" ? "authoritative-explicit-answer" : mode === "teacher-reviewed" ? "pending-teacher-review" : "unscored",
      implementationMode: mode,
      implementationStatus: enabled ? "implemented-normalized-react" : "disabled-editorial-only",
      editorialStatus: enabled ? "reviewed-evidence-backed" : "manual-review-required",
      applicationFeedback: {
        source: "application-generated-neutral",
        labels: mode === "teacher-reviewed" ? ["Submitted", "Awaiting teacher review"] : mode === "auto-scored" ? ["Correct", "Incorrect", "Try again"] : ["Answer saved"],
      },
      runtime: { questions: runtimeQuestions },
      fieldProvenance: {
        visibleExerciseNumber: visibleExerciseNumber === null ? null : visualProvenance(activity),
        visibleInstructionText: instructionsById[shortId] ? visualProvenance(activity) : null,
        questionPromptText: runtimeQuestions.map((question) => question.sourceType === "open-response" && manualPromptsById[shortId]
          ? visualProvenance(activity)
          : `${sourcePathFor(activity)}#decoded-visible-text`),
        optionText: runtimeQuestions.map((question) => question.options.length ? `${sourcePathFor(activity)}#decoded-options` : null),
        explicitAnswerEvidence: runtimeQuestions.map((question) => question.acceptedAnswers.length ? `${sourcePathFor(activity)}#decoded-explicit-answer` : null),
      },
      sourceProvenance,
      warnings: [...new Set([
        ...warnings,
        ...(mode === "unsupported-disabled" ? ["Hidden from students; visible to teachers as a disabled editorial record."] : []),
        ...(["ticTacToe", "choosingGame"].some((type) => activity.publisherInteractionTypes.includes(type)) ? ["Legacy game semantics are intentionally not reproduced."] : []),
      ])],
    });
  }
  return {
    schemaVersion: "1.0",
    book: "ultimate-b2",
    component: "students-book",
    unitNumber: 2,
    printedPageRange: "19-34",
    deterministicOrder: "partNumber, publisher object order",
    automaticPublication: false,
    feedbackPolicy: "Publisher feedback was not found; all UI feedback labels are application-generated neutral feedback.",
    activities: records,
    summary: Object.fromEntries([...allowedModes].map((mode) => [mode, records.filter((record) => record.implementationMode === mode).length])),
  };
}

function implementationReport(matrix) {
  const enabled = matrix.activities.filter((activity) => activity.implementationMode !== "unsupported-disabled");
  const lines = [
    "# Ultimate B2 Students Book Unit 2 implementation report",
    "",
    `The matrix covers all ${matrix.activities.length} definite publisher activity objects on printed pages 19–34. ${enabled.length} are enabled from explicit evidence; ${matrix.summary["unsupported-disabled"]} remain disabled rather than guessed.`,
    "",
    "## Evidence and safety boundary",
    "",
    "Content was recovered from decoded structured metadata, readable XML/configuration, the normalized catalog, direct visual inspection of all 12 Unit 2 page images (19, 20–21, 22–23, 24–25, 26, 27, 28–29, 30, 31, 32, 33, 34), and known media relationships. No bulk OCR or legacy Flash runtime was used. The legacy feature flag remains default-off.",
    "",
    "## Implementation counts",
    "",
    "| Mode | Count |",
    "|---|---:|",
    ...[...allowedModes].map((mode) => `| ${mode} | ${matrix.summary[mode]} |`),
    "",
    "## Object decisions",
    "",
    "| Stable ID | Page/spread | Exercise | Source type | Mode | Status | Warning |",
    "|---|---|---|---|---|---|---|",
    ...matrix.activities.map((activity) => `| ${activity.stableNormalizedId} | ${activity.printedPage} / ${activity.printedSpread} | ${activity.visibleExerciseNumber ?? "—"} | ${activity.sourceInteractionType.join(", ") || "unknown"} | ${activity.implementationMode} | ${activity.implementationStatus} | ${activity.warnings.join(" ") || "—"} |`),
    "",
    "## Scoring and review",
    "",
    "Auto-scored records contain paired visible prompts and explicit publisher answers. Assignment submissions are re-scored by the server. Teacher-reviewed records store answers with a null score and an awaiting-review status; existing teacher feedback and entitlement checks remain authoritative. Practice and reading records do not fabricate grades.",
    "",
    "## Media and platform behavior",
    "",
    "Known Unit 2 audio/video relationships carry protected logical keys and development-only local fallbacks. Missing protected assets fail gracefully. Android offline builds bundle all seven confirmed Unit 2 media sources locally, while teacher-reviewed responses are local-only and are not synchronized offline. Existing Android offline page assets and Reading Exercises 3 and 4 remain intact; unsupported legacy effects are not reproduced.",
    "",
  ];
  return lines.join("\n");
}

function migrationSql(matrix) {
  const existingIds = new Set(["ultimate-b2-sb-u2-p2-o3", "ultimate-b2-sb-u2-p2-o4"]);
  const seed = matrix.activities
    .filter((activity) => ["auto-scored", "teacher-reviewed"].includes(activity.implementationMode) && !existingIds.has(activity.stableNormalizedId))
    .map((activity) => ({
      stableNormalizedId: activity.stableNormalizedId,
      partNumber: activity.partNumber,
      title: activity.title,
      instructions: activity.visibleInstructionText,
      implementationMode: activity.implementationMode,
      activityType: activity.implementationMode === "teacher-reviewed"
        ? "writing"
        : activity.runtime.questions.some((question) => question.options.length) ? "matching" : "typed_gap_fill",
      questions: activity.runtime.questions.map((question, index) => ({
        number: index + 1,
        prompt: question.prompt,
        questionType: activity.implementationMode === "teacher-reviewed" ? "open_response" : question.options.length ? "matching" : "typed_short_answer",
        acceptedAnswers: question.acceptedAnswers,
        options: question.options.map((option) => option.text),
      })),
    }));
  const payload = JSON.stringify(seed);
  return `begin;

-- Evidence-backed Unit 2 activities recovered from decoded publisher metadata.
-- Answer keys remain in the authoritative database; the browser runtime catalog
-- intentionally contains prompts/options only.

do $migration$
declare
  unit_uuid uuid;
  lesson_uuid uuid;
  activity_uuid uuid;
  question_uuid uuid;
  activity_record jsonb;
  question_record jsonb;
  option_record record;
  lesson_slug_value text;
begin
  select u.id into unit_uuid
  from units u
  join book_components bc on bc.id = u.book_component_id
  join book_packages bp on bp.id = bc.book_package_id
  where bp.slug = 'ultimate-b2'
    and bc.slug = 'ultimate-b2-students-book'
    and u.slug = 'unit-2'
  limit 1;

  if unit_uuid is null then
    raise exception 'Ultimate B2 Students Book Unit 2 was not found';
  end if;

  for activity_record in
    select value from jsonb_array_elements($unit2$${payload}$unit2$::jsonb)
  loop
    lesson_slug_value := case
      when (activity_record->>'partNumber')::int = 2 then 'unit-2-reading'
      else 'unit-2-part-' || lpad(activity_record->>'partNumber', 2, '0')
    end;

    if (activity_record->>'partNumber')::int <> 2 then
      insert into lessons (unit_id, title, slug, lesson_type, sort_order, position, instructions, status)
      values (
        unit_uuid,
        'Unit 2 · Part ' || (activity_record->>'partNumber'),
        lesson_slug_value,
        'students-book-activity',
        (activity_record->>'partNumber')::int,
        (activity_record->>'partNumber')::int,
        'Evidence-backed Students Book Unit 2 activities.',
        'published'
      )
      on conflict (unit_id, slug) do update
      set title = excluded.title,
          lesson_type = excluded.lesson_type,
          sort_order = excluded.sort_order,
          position = excluded.position,
          instructions = excluded.instructions,
          status = excluded.status;
    end if;

    select id into lesson_uuid from lessons where unit_id = unit_uuid and slug = lesson_slug_value limit 1;

    insert into activities (
      lesson_id, slug, title, type, activity_type, instructions, estimated_minutes,
      content, content_json, settings_json, sort_order, is_assignable, is_demo_active
    )
    values (
      lesson_uuid,
      activity_record->>'stableNormalizedId',
      activity_record->>'title',
      activity_record->>'activityType',
      activity_record->>'activityType',
      coalesce(activity_record->>'instructions', ''),
      10,
      jsonb_build_object(
        'demoActivityKey', activity_record->>'stableNormalizedId',
        'publisherSourceActivityId', activity_record->>'stableNormalizedId',
        'implementationMode', activity_record->>'implementationMode',
        'feedbackSource', 'application-generated-neutral'
      ),
      jsonb_build_object(
        'demoActivityKey', activity_record->>'stableNormalizedId',
        'publisherSourceActivityId', activity_record->>'stableNormalizedId',
        'implementationMode', activity_record->>'implementationMode',
        'feedbackSource', 'application-generated-neutral'
      ),
      '{}'::jsonb,
      (activity_record->>'partNumber')::int * 100,
      true,
      true
    )
    on conflict (lesson_id, slug) do update
    set title = excluded.title,
        type = excluded.type,
        activity_type = excluded.activity_type,
        instructions = excluded.instructions,
        content = excluded.content,
        content_json = excluded.content_json,
        settings_json = excluded.settings_json,
        sort_order = excluded.sort_order,
        is_assignable = excluded.is_assignable,
        is_demo_active = excluded.is_demo_active;

    select id into activity_uuid from activities where lesson_id = lesson_uuid and slug = activity_record->>'stableNormalizedId' limit 1;

    for question_record in select value from jsonb_array_elements(activity_record->'questions')
    loop
      insert into questions (activity_id, question_number, prompt, question_type, content_json, feedback_json, sort_order)
      values (
        activity_uuid,
        (question_record->>'number')::int,
        question_record->>'prompt',
        question_record->>'questionType',
        '{}'::jsonb,
        jsonb_build_object(
          'acceptedAnswers', coalesce(question_record->'acceptedAnswers', '[]'::jsonb),
          'source', case when activity_record->>'implementationMode' = 'teacher-reviewed' then 'none-open-response' else 'decoded-publisher-explicit-answer' end,
          'feedbackSource', 'application-generated-neutral'
        ),
        (question_record->>'number')::int
      )
      on conflict (activity_id, question_number) do update
      set prompt = excluded.prompt,
          question_type = excluded.question_type,
          content_json = excluded.content_json,
          feedback_json = excluded.feedback_json,
          sort_order = excluded.sort_order;

      select id into question_uuid from questions
      where activity_id = activity_uuid and question_number = (question_record->>'number')::int
      limit 1;

      for option_record in
        select value, ordinal
        from jsonb_array_elements_text(coalesce(question_record->'options', '[]'::jsonb)) with ordinality as option_row(value, ordinal)
      loop
        insert into question_options (question_id, option_label, option_text, is_correct, sort_order)
        values (
          question_uuid,
          option_record.value,
          option_record.value,
          coalesce(question_record->'acceptedAnswers', '[]'::jsonb) ? option_record.value,
          option_record.ordinal
        )
        on conflict (question_id, option_label) do update
        set option_text = excluded.option_text,
            is_correct = excluded.is_correct,
            sort_order = excluded.sort_order;
      end loop;
    end loop;
  end loop;
end
$migration$;

commit;
`;
}

export async function writeUnit02ImplementationOutputs(matrix, { root = outputRoot } = {}) {
  await mkdir(root, { recursive: true });
  await writeDeterministicJson(path.join(root, "unit-02.implementation-matrix.json"), matrix);
  await writeFile(path.join(root, "unit-02.implementation-report.md"), implementationReport(matrix), "utf8");
  await writeDeterministicJson(frontendOutput, {
    schemaVersion: matrix.schemaVersion,
    book: matrix.book,
    component: matrix.component,
    unitNumber: matrix.unitNumber,
    activities: matrix.activities.map((activity) => ({
      stableNormalizedId: activity.stableNormalizedId,
      title: activity.title,
      visibleInstructionText: activity.visibleInstructionText,
      implementationMode: activity.implementationMode,
      implementationStatus: activity.implementationStatus,
      mediaDependencies: activity.mediaDependencies
        .filter((dependency) => dependency.logicalKey)
        .map(({ type, logicalKey }) => ({ type, logicalKey })),
      runtime: {
        questions: activity.runtime.questions.map((question) => ({
          id: question.id,
          number: question.number,
          prompt: question.prompt,
          options: question.options,
          sourceType: question.sourceType,
        })),
      },
    })),
  });
  await writeFile(migrationOutput, migrationSql(matrix), "utf8");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const matrix = await buildUnit02ImplementationMatrix();
  await writeUnit02ImplementationOutputs(matrix);
  console.log(JSON.stringify({ activities: matrix.activities.length, ...matrix.summary, output: "books/ultimate-b2/generated/editorial" }, null, 2));
}
