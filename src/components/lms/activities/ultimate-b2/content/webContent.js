export { readingExercise3, readingExercise3Options, readingExercise4, readingText } from "./readingContent.js";
export { grammarRuleSections } from "./grammarContent.js";

// Standard web builds receive learner-visible material only. The corresponding
// answer-bearing catalog is selected exclusively by the Android offline build.
export const listeningGapFillItems = [
  ["lgf-1", "Alex says that if they want to be warmer, people should go to the ___ part of the boat.", "Alex says that if they want to be warmer, people should go to the", "part of the boat."],
  ["lgf-2", "The river cruise will take ___ hours in total.", "The river cruise will take", "hours in total."],
  ["lgf-3", "A River Pass allows tourists to get off the boat in the ___.", "A River Pass allows tourists to get off the boat in the", "."],
  ["lgf-4", "Roman invaders built the first bridge across the Thames ___ ago.", "Roman invaders built the first bridge across the Thames", "ago."],
  ["lgf-5", "Long ago, many sections of the river would ___ over completely in winter.", "Long ago, many sections of the river would", "over completely in winter."],
  ["lgf-6", "During 'Frost Fairs', dancing and ___ took place on the ice.", "During 'Frost Fairs', dancing and", "took place on the ice."],
  ["lgf-7", "In the 1950s, the Thames was said to be a ___ river.", "In the 1950s, the Thames was said to be a", "river."],
  ["lgf-8", "Alex explains that now, even ___ occasionally swim up the river.", "Alex explains that now, even", "occasionally swim up the river."],
  ["lgf-9", "The movement of sea water can sometimes cause ___ in London.", "The movement of sea water can sometimes cause", "in London."],
  ["lgf-10", "Annually, ___ million tourists ride on the London Eye.", "Annually,", "million tourists ride on the London Eye."],
].map(([id, prompt, before, after]) => ({ id, prompt, before, after }));

export const grammarOpening = [
  { id: "go-1", prompt: "By the time Maya arrived, the club ___ already started.", options: ["had", "has", "was"] },
  { id: "go-2", prompt: "The lamp was redesigned ___ it could fit on a bag.", options: ["so that", "although", "unless"] },
  { id: "go-3", prompt: "Maya kept testing ___ the circuit worked.", options: ["until", "despite", "whereas"] },
  { id: "go-4", prompt: "If she had ignored the rider, the design ___ less practical.", options: ["would have been", "will be", "is being"] },
];

export const grammarExercise4 = [
  ["g4-1", "I woke up this morning.", "It was snowing.", "when"],
  ["g4-2", "I was studying.", "I suddenly felt sleepy.", "while"],
  ["g4-3", "I was walking home.", "I ran into a friend of mine.", "as"],
  ["g4-4", "I made the final decision.", "I felt a lot more relaxed.", "as soon as"],
  ["g4-5", "I heard him come in.", "We were having dinner.", "while"],
  ["g4-6", "We were packing for our trip.", "The power went off.", "when"],
].map(([id, firstSentence, secondSentence, connector]) => ({
  id,
  firstSentence,
  secondSentence,
  connector,
  prompt: `${firstSentence} ${secondSentence} ${connector}`,
}));

// Legacy quizzes remain available from database-backed assignments on the web.
// Their local scoring catalogs are intentionally Android-only.
export const grammarQuizQuestions = [];
export const quiz1Questions = [];
export const quiz2Questions = [];
export const quizQuestions = [];
export const QUIZ_DURATION_SECONDS = 20 * 60;
