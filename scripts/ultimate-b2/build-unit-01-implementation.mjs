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
const frontendOutput = path.join(repoRoot, "src/data/ultimate-b2/generated/unit-01.runtime.json");
const migrationOutput = path.join(repoRoot, "database/021_ultimate_b2_unit1_recovered_activities.sql");
const publisherRoot = "Contents/Resources/assets/books/book1/unit/1";

const allowedModes = new Set(["auto-scored", "teacher-reviewed", "unscored-practice", "reading-content", "unsupported-disabled"]);
const sectionByPart = new Map([
  [1, "Unit opener"], [2, "Reading"], [3, "Vocabulary in Use"], [4, "Grammar in Use"],
  [5, "Listening"], [6, "Speaking"], [7, "Writing"], [8, "Review 1"],
  [9, "B2 Practice 1"], [10, "B2 Practice 1"],
]);

const exerciseById = {
  "p1-o1": "1",
  "p2-o1": "1", "p2-o2": "2", "p2-o3": "3", "p2-o4": "4", "p2-o5": "Debate club",
  "p3-o1": "1", "p3-o2": "2", "p3-o3": "3", "p3-o4": "4", "p3-o5": "5", "p3-o6": "6", "p3-o7": "7",
  "p4-o1": "1", "p4-o3": "3", "p4-o4": "4", "p4-o6": "6", "p4-o7": "7", "p4-o8": "8",
  "p5-o2": "2", "p5-o3": "3", "p5-o4": "4", "p5-o5": "5",
  "p6-o2": "2", "p6-o6": "Problem solvers",
  "p7-o2": "1", "p7-o3": "2", "p7-o4": "3", "p7-o5": "4", "p7-o6": "5", "p7-o8": "6", "p7-o9": "7", "p7-o10": "8",
  "p8-o1": "Vocabulary", "p8-o2": "Grammar", "p8-o3": "Game 1", "p8-o4": "Game 2",
  "p9-o1": "1", "p10-o1": "2",
};

const instructionsById = {
  "p1-o1": "Read the quote and discuss these questions with a partner.",
  "p2-o1": "Watch the video and answer the questions.",
  "p2-o2": "Listen and read the text. Then answer the questions.",
  "p2-o3": "Read the text again. For questions 1–6, choose the answer (A, B, C or D) which you think fits best according to the text.",
  "p2-o4": "Complete the sentences with the correct form of the highlighted words (1–9) in the text.",
  "p2-o5": "With your partner, discuss the question below. Use the ideas given and add your own. Then take turns to present your arguments.",
  "p3-o1": "Read and complete the text with these words.", "p3-o2": "Complete the sentences with these nouns.",
  "p3-o3": "Circle the correct meaning of the expressions in bold.", "p3-o4": "Complete the phrasal verbs in bold. Write one word in each gap.",
  "p3-o5": "Complete the table.", "p3-o6": "Complete the sentences with words from Exercise 5.", "p3-o7": "Read and choose the correct answers.",
  "p4-o1": "Watch the video and answer the questions.", "p4-o3": "Read and circle the correct answers.",
  "p4-o4": "Complete. Use the present simple or the present continuous.",
  "p4-o6": "Complete. Use the present perfect simple or the present perfect continuous.",
  "p4-o7": "Read and circle the correct answers.", "p4-o8": "Read and complete the text. Write one word in each gap.",
  "p5-o2": "Read and answer the questions.",
  "p5-o3": "Listen and read the text for question 1. What is the correct answer? Which option(s) did you eliminate? Why?",
  "p5-o4": "You will hear people talking in six different situations. Underline the key words in the questions and options. Then listen and choose the best answer (A, B or C) for questions 1–6.",
  "p5-o5": "Listen again. Then discuss with your partner why the other options in questions 1, 2 and 3 are wrong.",
  "p6-o2": "Listen to two students talking about themselves and tick the right box.",
  "p6-o6": "Work in pairs. Imagine you are the director of a TV channel and you need to add a new programme for young people. Choose one of the options below and explain your decision.",
  "p7-o2": "Read the writing task and answer the questions.",
  "p7-o3": "Read the task in Exercise 1 again. Then tick the things the writer must do in the email.",
  "p7-o4": "Read the model email and answer the questions.",
  "p7-o5": "Decide if these phrases are used to begin or end emails. Write B (begin) or E (end). Then tick the informal phrases.",
  "p7-o6": "Read the email in Exercise 3 and circle examples of these kinds of informal language.",
  "p7-o8": "Read the writing task. Then make notes about what you have to do.",
  "p7-o9": "Read the Language checklist and complete the sentences.",
  "p7-o10": "Complete the paragraph plan and write your email.",
  "p8-o1": "Choose the correct answers.", "p8-o2": "Choose the correct answers.",
  "p8-o3": "Legacy team game.", "p8-o4": "Legacy team game.",
  "p9-o1": "You are going to read an article about watching TV series. For questions 1–6, choose the answer (A, B, C or D) which you think fits best according to the text.",
  "p10-o1": "You will hear people talking in eight different situations. For questions 1–8, choose the best answer (A, B or C).",
};

const requestedModes = new Map();
function setModes(ids, mode) { ids.split(/\s+/).filter(Boolean).forEach((id) => requestedModes.set(id, mode)); }
setModes("p2-o3 p2-o4 p3-o1 p3-o2 p3-o3 p3-o4 p3-o5 p3-o6 p3-o7 p4-o3 p4-o4 p4-o6 p4-o7 p4-o8 p5-o3 p5-o4 p6-o2 p7-o9 p8-o1 p8-o2 p9-o1 p10-o1", "auto-scored");
setModes("p1-o1 p2-o1 p2-o2 p2-o5 p4-o1 p6-o6 p7-o2 p7-o4 p7-o8 p7-o10", "teacher-reviewed");
setModes("p5-o2 p5-o5 p7-o3 p7-o5 p7-o6", "unscored-practice");
setModes("p8-o3 p8-o4", "unsupported-disabled");

const manualPromptsById = {
  "p1-o1": ["In what ways are films an art form?", "Why is theatre life?", "Do you agree that TV is furniture?"],
  "p2-o1": ["How is video on-demand changing the way we watch TV?", "When is binge-watching bad for our health?"],
  "p2-o2": ["What is the main idea of the text?", "What is the Netflix effect according to the text?", "What benefits do TV series and films both have?"],
  "p2-o5": ["Watching a film at home is better than going to the cinema. Agree or disagree?"],
  "p4-o1": ["In a film, what does a stuntman do?", "In what way is a stunt similar to a dance routine?", "What are the signs that a stunt double is doing a good job?"],
  "p5-o5": ["Discuss why the other options in questions 1, 2 and 3 are wrong."],
  "p6-o6": ["Choose a programme for young people and explain your decision: science-fiction series, comedy series, adventure series, documentaries, sports programme, music programme, films, or crime series."],
  "p7-o2": ["What kind of text do you have to write?", "Who are you writing to?", "What is the situation?", "How many questions do you have to answer?"],
  "p7-o4": ["Does the writer answer all the questions in the task?", "In which paragraph does the writer answer two questions?", "What are the functions of paragraphs 1–4? Write the correct numbers."],
  "p7-o6": ["contractions", "everyday expressions", "phrasal verbs"],
  "p7-o8": ["What kind of text do you have to write?", "Who are you writing to?", "What is the situation?", "How many questions do you have to answer?"],
  "p7-o10": ["Write your email. (140–190 words)"],
};

const unscoredQuestionsById = {
  "p5-o2": [{ prompt: "You hear two people discussing television today. What do they agree about?", options: ["TV is more entertaining than it was in the past.", "Today’s viewers access TV in different ways.", "The quality of programmes has become poorer."] }],
  "p7-o3": ["introduce themselves", "mention the reader’s email", "describe their viewing preferences", "provide their reason for writing", "give information", "apologise for something", "end the email in a friendly and helpful way", "ask for information", "make a recommendation"].map((prompt) => ({ prompt, options: ["Tick", "Leave blank"] })),
  "p7-o5": ["Bye for now!", "Dear Mr Darcy,", "Yours faithfully,", "I look forward to hearing from you.", "Give my love to everyone.", "Hi Leo,", "I am writing with regard to ...", "Dear Sir/Madam,", "Well, that’s all for now.", "Lots of love,", "Thanks very much for your email.", "It was great to hear from you!", "Write back soon!", "Yours sincerely,"].map((prompt) => ({ prompt, options: ["B (begin)", "E (end)", "Informal phrase"] })),
};

const autoPromptOverridesById = {
  "p3-o1": [
    "Have you ever wondered what steps are involved before a film can be ____?", "Here is a rough guide to what happens when a ____ decides to make a film.",
    "The development stage includes planning and budgeting, as well as finding the ____ of actors.", "Writing and re-writing of the ____ takes place during this stage.",
    "Preparation also involves choosing the location for outdoor ____.", "____ designers work on the clothes.", "By the time ____ begin, the number of people involved has increased dramatically.",
    "During the actual shooting of the film, the director co-ordinates the actors and the rest of the film ____, such as lighting technicians.", "camera operators and make-up ____.", "Then, when filming is complete, they add the ____.",
  ],
  "p3-o5": ["confuse → Noun: ____", "disappoint → Noun: ____", "____ → Noun: entertainment", "frighten → Adjective: ____", "frustrate → Noun: ____", "____ → Noun: inspiration", "stimulate → Noun: ____"],
};

const mc = (prompt, options) => ({ prompt, options });
const manualMultipleChoiceById = {
  "p2-o3": [
    mc("What is the writer’s purpose in the first paragraph?", ["to explain how media streaming works", "to introduce a comparison between two types of entertainment", "to describe the many ways people relax", "to give details about popular kinds of films"]),
    mc("The writer mentions seasons in line 9 to", ["say that series only last a few months.", "refer to when series are shown.", "explain how series are structured.", "complain about how series are organised."]),
    mc("According to the text, when viewers binge-watch, they", ["start seeing the series’ characters as real people.", "forget about their everyday life.", "watch two episodes back to back.", "watch all the episodes that have been released."]),
    mc("Why does the writer express concern about binge-watching?", ["It might prevent people from socialising with friends.", "It’s not a normal thing to do.", "Viewers may become too attached to the characters.", "Viewers have fewer reasons to do other things."]),
    mc("What significant difference between films and series does the author mention?", ["Films are more entertaining than series.", "Series rely on images to tell stories more than films do.", "Films don’t develop as many sub-plots as series do.", "Dialogues in films are shorter than in series."]),
    mc("What does the writer refer to in line 53?", ["all films", "certain popular series", "people who watch films", "film franchises"]),
  ],
  "p3-o3": [
    mc("Ann Hathaway has been in the limelight since the release of her latest film.", ["the centre of attention", "less popular"]), mc("In Pokémon Detective Pikachu, actor Ryan Reynolds steals the show with his great voice acting.", ["gives a great performance", "gives an average performance"]),
    mc("Jennifer’s new play opens tonight. I told her to break a leg.", ["warned her she might fall", "wished her good luck"]), mc("Let me just set the scene – imagine a cold, snow-covered landscape.", ["describe the background", "explain the plot"]),
    mc("Sometimes, when I come home, I can hear my mum in the kitchen singing her heart out to the radio.", ["singing softly", "singing with emotion"]), mc("The play didn’t live up to our expectations and we left half-way through.", ["disappointed us", "seemed endless"]),
    mc("We’re ready to start performing. Let’s get this show on the road!", ["let’s go to a show", "let’s get started"]), mc("I hope our new teacher is nice – Mr Carter is a hard act to follow.", ["is difficult to replace", "is hard on students"]),
  ],
  "p3-o7": [
    mc("With the rise in popularity of TV ____, film would be less popular today.", ["episodes", "seasons", "scenes", "series"]), mc("Specific film ____ appeal to different age groups.", ["genres", "effects", "crews", "auditions"]),
    mc("Film producers avoid extremely ____ scenes when they make films.", ["amusing", "entertaining", "frightening", "inspiring"]), mc("A box-office ____ can attract viewers of all ages.", ["crash", "smash", "cash", "flash"]),
    mc("A famous actor in the leading ____ can make a big difference too.", ["role", "costume", "show", "action"]), mc("They may look at the ____ to see if they recognise any actors.", ["plot", "cast", "soundtrack", "performance"]),
    mc("They may watch a film because they have read positive ____ in the press.", ["scripts", "soundtracks", "dialogues", "reviews"]), mc("Strong themes and stories that ____ the mind are also more likely to appeal to this age group.", ["confuse", "frustrate", "stimulate", "release"]),
  ],
  "p4-o3": [
    mc("Television and videos ____ so popular today.", ["are", "are being"]), mc("Some people ____ the radio is dead.", ["think", "are thinking"]), mc("Being able to access radio stations online ____ the radio has gained a whole new audience.", ["means", "is meaning"]),
    mc("These days, you ____ any special equipment.", ["don’t need", "aren’t needing"]), mc("You ____ on your computer, phone or other smart device.", ["just turn", "are just turning"]), mc("____ to learn English or another foreign language?", ["Do you try", "Are you trying"]),
    mc("You can easily tune in to ____ back home.", ["what’s happening", "what happens"]), mc("People who normally ____ to a lot of music.", ["listen", "are listening"]), mc("If you ____ into classical music.", ["just get", "are just getting"]), mc("Individual radio stations ____ what other stations are available.", ["don’t usually advertise", "aren’t usually advertising"]),
  ],
  "p4-o7": [
    mc("I’ve never ____ a serious accident.", ["had", "been having"]), mc("I’ve already ____ for hours.", ["travelled", "been travelling"]), mc("I couldn’t tell you how long I’ve ____ in the make-up chair before each job.", ["spent", "been spending"]), mc("Recently I’ve been ____ sword fighting.", ["learnt", "learning"]),
    mc("I suppose the reason I’ve ____ injury is that we do so much preparation.", ["avoided", "been avoiding"]), mc("That’s partly because we’ve ____ it so many times before.", ["rehearsed", "been rehearsing"]), mc("What have I been ____ all day?", ["done", "doing"]), mc("I’ve never ____ of doing anything else.", ["thought", "been thinking"]),
  ],
  "p5-o3": [mc("You hear two people discussing television today. What do they agree about?", ["TV is more entertaining than it was in the past.", "Today’s viewers access TV in different ways.", "The quality of programmes has become poorer."])],
  "p5-o4": [
    mc("You hear a girl talking about making videos. What is she doing?", ["warning beginners about what they should not film", "advising people what kind of camera to buy", "talking about filming mistakes she has made"]),
    mc("You hear two people talking about a performance they are attending. What does the woman believe?", ["The dance company lacks talent.", "The dancers are not taking any risks.", "The choreography is weak."]),
    mc("You hear a man talking about attending live concerts. How does he feel about it?", ["It is the best way to appreciate rock music.", "It highlights what is missing from most recordings.", "It provides the ideal atmosphere to enjoy classical music."]),
    mc("You hear a presenter advertising a radio programme. She says listeners", ["will have two opportunities to hear the first episode.", "can hear the results of a competition during the programme.", "are invited to send in their own reviews of the programme."]),
    mc("You hear two people talking about comedy. What do they both enjoy?", ["physical humour", "live comedians", "humorous writing"]),
    mc("You hear two friends talking about a live concert. How does the boy feel?", ["stressed about performing in front of his family", "worried because he hasn’t practised enough", "concerned his saxophone needs repairing"]),
  ],
  "p6-o2": [
    mc("Which student uses a good range of vocabulary?", ["Michael", "Jenny"]), mc("Which student checks they have understood the question?", ["Michael", "Jenny"]), mc("Which student gives very short answers?", ["Michael", "Jenny"]),
    mc("Which student gives full answers with reasons and examples?", ["Michael", "Jenny"]), mc("Which student misunderstands a question?", ["Michael", "Jenny"]), mc("Which student performs better?", ["Michael", "Jenny"]),
  ],
  "p8-o1": [
    mc("The famous musician has worked on hundreds of ____ during his career.", ["scripts", "soundtracks", "plots", "special effects"]), mc("The concert hall was full and they had to ____ dozens of people last night.", ["turn around", "turn down", "turn to", "turn away"]),
    mc("As soon as I saw the opening ____, I knew that I was going to love the film.", ["scene", "episode", "rehearsal", "season"]), mc("The young actress hasn’t been offered any leading ____ yet, but she has appeared in a number of plays.", ["reviews", "genres", "roles", "performances"]),
    mc("They weren’t really looking forward to the show, but it ____ to be very entertaining.", ["turned down", "turned into", "turned out", "turned up"]), mc("They had to stop filming because the ____ had run out of money.", ["designer", "producer", "cast", "crew"]),
    mc("To our great ____, we couldn’t get tickets for the show.", ["stimulation", "confusion", "disappointment", "amusement"]), mc("The director was delighted with the actor’s ____ performance.", ["inspired", "frustrated", "entertained", "frightened"]),
    mc("British bands ____ the show at this year’s music awards.", ["broke", "stole", "followed", "set"]), mc("There are far fewer ____ than there used to be due to streaming services like Netflix.", ["box-offices", "binge-watching", "sub-plots", "cinemagoers"]),
  ],
  "p8-o2": [
    mc("Be quiet, please! The director ____ the actors instructions for the next scene.", ["gives", "is giving", "has given", "has been giving"]), mc("We ____ to the theatre in London’s West End a few times this year.", ["have been", "have gone", "are going", "are being"]),
    mc("The leading actor ____ about something! I wish he would stop!", ["has always been complaining", "always complaining", "is always complaining", "has always complained"]), mc("What ____ of Brad Pitt’s new film?", ["do you think", "you are thinking", "have you thought", "are you thinking"]),
    mc("This is the first time ____ this programme. It’s good, isn’t it?", ["I watch", "I’m watching", "I’ve been watching", "I’ve watched"]), mc("Do you know what time ____?", ["does the market open", "the market opens", "the market is open", "is the market opening"]),
    mc("My dad ____ as a film director. He used to be a set designer.", ["isn’t always working", "doesn’t always work", "hasn’t always worked", "hasn’t always been working"]), mc("I ____ at the local theatre at the moment, and I love it!", ["am working", "work", "have worked", "have been working"]),
    mc("We’re exhausted because we ____ for hours.", ["are rehearsing", "have rehearsed", "rehearse", "have been rehearsing"]), mc("My friend ____ acting lessons for a while now, and she has an audition next week!", ["takes", "is taking", "has been taking", "has been taken"]),
  ],
  "p9-o1": [
    mc("At the end of the first paragraph, the writer is emphasising", ["how long some people might binge-watch for.", "that viewers’ habits have not changed.", "how unhealthy some people’s viewing habits are.", "that some series can become boring."]),
    mc("What was the purpose of the study mentioned in the second paragraph?", ["to identify the most popular horror shows", "to find out which age group watched thrillers and horror shows", "to determine the habits of binge-watchers", "to understand why people stayed up all night"]),
    mc("What particularly impressed the writer about The Umbrella Academy?", ["its main characters", "the plot", "its popularity", "the music"]),
    mc("Why does the writer mention covering your eyes in IT?", ["because viewers might be scared by what they see", "because viewers will not understand what is happening", "because parts of the series are slow-moving and tiring", "because information about the next episode is revealed"]),
    mc("According to the text, which series’ themes have been modernised?", ["The Umbrella Academy", "Stranger Things", "Anne with an E", "The Letter for the King"]),
    mc("What is the writer’s main point in the last paragraph?", ["As a society, we watch too much TV.", "We need to encourage people to read more.", "Binge-watching and devouring a book are similar behaviours.", "Once viewers start binge-watching, they cannot stop."]),
  ],
  "p10-o1": [
    mc("You hear an announcement in a theatre. What is the announcer’s main purpose?", ["to prepare the audience for the start of the play", "to describe the play", "to explain where the audience should sit"]),
    mc("You hear a teacher talking to his class. What does he want the students to do?", ["read the next chapter of their book", "write about each character’s personality", "re-read the essays they have written"]),
    mc("You hear a review on the radio describing a musical. What has changed since he saw it?", ["They have replaced a cast member.", "Child actors play all the parts.", "The children’s singing has improved."]),
    mc("You hear part of a news programme. What has happened north of Oldfield?", ["The weather has changed suddenly.", "Lorry drivers have been causing long delays.", "Road traffic has been blocked."]),
    mc("You hear a boy leaving a message for his friend. Why is he calling?", ["to congratulate him", "to offer tips on studying", "to invite him somewhere"]),
    mc("You hear a woman talking to her son about food. What is she doing?", ["complaining about the boy’s eating habits", "giving him a choice of what to eat now", "asking the boy to help in preparing the meals"]),
    mc("You hear a girl talking about her school project. What does she say about the app she uses?", ["It is for keeping a record of the birds they have seen.", "It helps you make videos of the birds you see.", "It is useful for writing descriptions of birds."]),
    mc("You hear two people discussing a film. What do they agree about?", ["The main character’s acting is poor.", "The special effects are impressive.", "The script is badly written."]),
  ],
};

const mediaById = {
  "p2-o1": [{ type: "video", logicalKey: "ultimate-b2.students-book.unit-1.reading.video-intro", sourceRelativePath: "Contents/Resources/assets/videos/book1/unit/1/part2/obj1.mp4" }],
  "p2-o2": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-1.reading.text-audio", sourceRelativePath: `${publisherRoot}/part2/obj2/audio.mp3` }],
  "p4-o1": [{ type: "video", logicalKey: "ultimate-b2.students-book.unit-1.grammar.video-intro", sourceRelativePath: "Contents/Resources/assets/videos/book1/unit/1/part4/obj1.mp4" }],
  "p5-o3": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-1.listening.television-dialogue", sourceRelativePath: `${publisherRoot}/part5/obj3/audio.mp3` }],
  "p5-o4": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-1.listening.six-situations", sourceRelativePath: `${publisherRoot}/part5/obj4/audio.mp3` }],
  "p5-o5": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-1.listening.discussion-review", sourceRelativePath: `${publisherRoot}/part5/obj5/audio.mp3` }],
  "p6-o2": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-1.speaking.student-comparison", sourceRelativePath: `${publisherRoot}/part6/obj2/audio.mp3` }],
  "p10-o1": [{ type: "audio", logicalKey: "ultimate-b2.students-book.unit-1.practice.eight-situations", sourceRelativePath: `${publisherRoot}/part10/obj1/audio.mp3` }],
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
  return sourceText(value).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, "").replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&").replaceAll("&quot;", "\"").replaceAll("&#39;", "'").replace(/_{3,}/g, "____").replace(/\s+/g, " ").trim();
}
function compactId(activity) { return `p${activity.partNumber}-o${activity.activityOrder}`; }
function sourcePathFor(activity, file = "obj_params.iwb") { return `${publisherRoot}/part${activity.partNumber}/obj${activity.activityOrder}/${file}`; }
async function sourceExists(relativePath, root = sourceRoot) { try { await access(path.join(root, relativePath)); return true; } catch { return false; } }

function promptGroups(document) {
  const nodes = collectByKey(document, "text").filter((node) => sourceText(node) && !node["@_answers"] && (node["@_x"] !== undefined || node["@_pagesIndex"] !== undefined))
    .sort((left, right) => Number(left["@_pagesIndex"] || 1) - Number(right["@_pagesIndex"] || 1) || Number(left["@_y"] || 0) - Number(right["@_y"] || 0) || Number(left["@_x"] || 0) - Number(right["@_x"] || 0));
  const groups = [];
  for (const node of nodes) {
    const raw = sourceText(node);
    const markers = [...raw.matchAll(/(?:\(\s*)?<b>\s*\(?(\d{1,2})\)?\s*<\/b>\s*\)?/gi)];
    if (markers.length) {
      markers.forEach((marker, index) => groups.push({ printedNumber: Number(marker[1]), pageIndex: Number(node["@_pagesIndex"] || 1), text: cleanText(raw.slice(marker.index, markers[index + 1]?.index ?? raw.length)) }));
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
        if (!answerNode || !String(answerNode["@_answers"] || "").trim()) continue;
        rows.push({ sourceType: type, pageIndex, acceptedAnswers: String(answerNode["@_answers"]).split("|").map(cleanText).filter(Boolean), publisherValue: answerNode["@_answers"] });
      }
    }
    if (["dnd", "dndCat"].includes(type)) {
      const drags = toArray(exercise.drags?.drag);
      const dragById = new Map(drags.map((drag) => [String(drag["@_id"]), cleanText(drag)]));
      const options = [...new Set(drags.map(cleanText).filter(Boolean))];
      for (const drop of toArray(exercise.drops?.drop)) {
        const publisherIds = String(drop["@_answers"] || "").split(",").map((id) => id.trim()).filter(Boolean);
        const acceptedAnswers = publisherIds.map((id) => dragById.get(id)).filter(Boolean);
        if (acceptedAnswers.length) rows.push({ sourceType: type, pageIndex, acceptedAnswers, options, publisherValue: drop["@_answers"] });
      }
    }
  }
  return rows;
}

function decodedMultipleChoiceAnswers(document) {
  const rows = [];
  for (const exercise of collectByKey(document, "exercise").filter((item) => item["@_type"] === "mc")) {
    for (const sentence of toArray(exercise.sentences?.sentence)) {
      const choices = toArray(sentence.choice);
      const answerIndex = Number(sentence["@_answer"]);
      const names = choices.map((choice) => String(choice["@_name"] || ""));
      const ordinalNames = names.every((name, index) => name.endsWith(`_${index + 1}`));
      if (!ordinalNames || !Number.isInteger(answerIndex) || answerIndex < 1 || answerIndex > choices.length) continue;
      rows.push({ answerIndex, publisherValue: String(sentence["@_answer"]), sourceType: "mc" });
    }
  }
  return rows;
}

async function decodeActivity(activity, root = sourceRoot) {
  const decoded = [];
  for (const file of ["obj_params.iwb", "ebook_obj_params.iwb", "questions_params.iwb"]) {
    const relative = sourcePathFor(activity, file);
    try { decoded.push({ relative, ...decodeIwbXml(await readFile(path.join(root, relative))) }); }
    catch (error) { if (error.code !== "ENOENT") decoded.push({ relative, error: error.message }); }
  }
  return decoded;
}

function runtimeQuestions(activity, document, mode) {
  const shortId = compactId(activity);
  const manualMc = manualMultipleChoiceById[shortId];
  if (manualMc && mode === "auto-scored") {
    const answers = decodedMultipleChoiceAnswers(document);
    if (answers.length !== manualMc.length) return [];
    return manualMc.map((question, index) => ({
      id: `${activity.id}-q${index + 1}`, number: index + 1, prompt: question.prompt,
      options: question.options.map((text, optionIndex) => ({ id: `${activity.id}-q${index + 1}-o${optionIndex + 1}`, text })),
      acceptedAnswers: [question.options[answers[index].answerIndex - 1]], sourceType: "multiple-choice", publisherAnswerValue: answers[index].publisherValue,
    }));
  }
  if (mode === "teacher-reviewed") return (manualPromptsById[shortId] || []).map((prompt, index) => ({ id: `${activity.id}-q${index + 1}`, number: index + 1, prompt, options: [], acceptedAnswers: [], sourceType: "open-response" }));
  if (mode === "unscored-practice") {
    const manual = unscoredQuestionsById[shortId] || (manualPromptsById[shortId] || []).map((prompt) => ({ prompt, options: [] }));
    return manual.map((question, index) => ({ id: `${activity.id}-q${index + 1}`, number: index + 1, prompt: question.prompt, options: (question.options || []).map((text, optionIndex) => ({ id: `${activity.id}-q${index + 1}-o${optionIndex + 1}`, text })), acceptedAnswers: [], sourceType: "practice-prompt" }));
  }
  if (mode !== "auto-scored") return [];
  const answers = decodedAnswerRows(document);
  const groups = promptGroups(document);
  const alignedGroups = [];
  for (const pageIndex of [...new Set(answers.map((answer) => answer.pageIndex))]) {
    const pageAnswers = answers.filter((answer) => answer.pageIndex === pageIndex);
    const pageGroups = groups.filter((group) => group.pageIndex === pageIndex);
    alignedGroups.push(...pageGroups.slice(Math.max(0, pageGroups.length - pageAnswers.length)));
  }
  const overrides = autoPromptOverridesById[shortId] || [];
  return answers.map((answer, index) => ({
    id: `${activity.id}-q${index + 1}`, number: index + 1, prompt: overrides[index] || alignedGroups[index]?.text || null,
    options: (answer.options || []).map((text, optionIndex) => ({ id: `${activity.id}-q${index + 1}-o${optionIndex + 1}`, text })),
    acceptedAnswers: answer.acceptedAnswers, sourceType: answer.sourceType, publisherAnswerValue: String(answer.publisherValue || ""),
  }));
}

function implementationTitle(activity, exercise) {
  const section = sectionByPart.get(activity.partNumber) || `Part ${activity.partNumber}`;
  return /^\d+$/.test(String(exercise)) ? `${section} · Exercise ${exercise}` : `${section} · ${exercise}`;
}
function visualProvenance(activity) { return `${publisherRoot}/parts/HD/parts_part_${activity.partNumber}.png`; }
function publisherEvidenceRecords(activity, document, questions, shortId) {
  if (questions.some((question) => question.acceptedAnswers.length)) {
    return questions.filter((question) => question.acceptedAnswers.length).map((question) => ({
      questionId: question.id,
      acceptedAnswers: question.acceptedAnswers,
      publisherValue: question.publisherAnswerValue || null,
      source: `${sourcePathFor(activity)}#decoded-explicit-answer`,
    }));
  }
  if (["p7-o4", "p7-o5"].includes(shortId)) {
    return decodedAnswerRows(document).map((answer, index) => ({
      questionId: `${activity.id}-evidence-${index + 1}`,
      acceptedAnswers: answer.acceptedAnswers,
      publisherValue: String(answer.publisherValue || ""),
      source: `${sourcePathFor(activity)}#decoded-explicit-answer`,
    }));
  }
  if (["p8-o3", "p8-o4"].includes(shortId)) {
    return (activity.answerRecords || []).filter((answer) => answer.decodedPublisherValue).map((answer, index) => ({
      questionId: `${activity.id}-evidence-${index + 1}`,
      acceptedAnswers: [answer.decodedPublisherValue],
      publisherValue: answer.decodedPublisherValue,
      source: `${sourcePathFor(activity, "questions_params.iwb")}#decoded-explicit-answer`,
    }));
  }
  return [];
}

function explicitEvidenceStatus(shortId, mode, evidenceRecords) {
  if (!evidenceRecords.length) return "none";
  if (mode === "auto-scored") return "complete-explicit-publisher-evidence";
  if (["p7-o4", "p7-o5"].includes(shortId)) return "partial-explicit-publisher-evidence";
  return "explicit-publisher-evidence-not-safely-runnable";
}

export async function buildUnit01ImplementationMatrix({ activities, source = sourceRoot } = {}) {
  if (!activities) activities = JSON.parse(await readFile(path.join(generatedRoot, "activities/unit-01.activities.json"), "utf8")).activities;
  const records = [];
  for (const activity of activities) {
    const shortId = compactId(activity);
    let mode = requestedModes.get(shortId) || "unsupported-disabled";
    if (!allowedModes.has(mode)) throw new Error(`Invalid implementation mode for ${shortId}: ${mode}`);
    const decoded = await decodeActivity(activity, source);
    const primary = decoded.find((entry) => entry.relative.endsWith("obj_params.iwb") && !entry.error)?.document || null;
    const questions = primary ? runtimeQuestions(activity, primary, mode) : [];
    const warnings = decoded.filter((entry) => entry.error).map((entry) => `${entry.relative}: ${entry.error}`);
    if (mode === "auto-scored" && (!questions.length || questions.some((question) => !question.prompt || !question.acceptedAnswers.length))) {
      warnings.push("Auto-scoring withheld because complete prompts and explicit publisher answers could not be paired deterministically.");
      mode = "unsupported-disabled";
    }
    if (["teacher-reviewed", "unscored-practice"].includes(mode) && !questions.length) {
      warnings.push("Learner interaction text was not recoverable without guessing.");
      mode = "unsupported-disabled";
    }
    const enabled = mode !== "unsupported-disabled";
    const exercise = exerciseById[shortId] ?? null;
    const sourceProvenance = [...new Set([...activity.sourceProvenance, ...decoded.filter((entry) => !entry.error).map((entry) => entry.relative), visualProvenance(activity)])].sort();
    const mediaDependencies = (mediaById[shortId] || []).map((dependency) => ({ ...dependency }));
    for (const dependency of mediaDependencies) dependency.sourceExistsAtGeneration = await sourceExists(dependency.sourceRelativePath, source);
    const evidenceRecords = primary ? publisherEvidenceRecords(activity, primary, questions, shortId) : [];
    const answerStatus = explicitEvidenceStatus(shortId, mode, evidenceRecords);
    records.push({
      stableNormalizedId: activity.id, publisherSourceActivityId: activity.publisherSourceActivityId, publisherObjectId: `part${activity.partNumber}/obj${activity.activityOrder}`,
      book: "ultimate-b2", component: "students-book", unitNumber: 1, partNumber: activity.partNumber, printedPage: activity.physicalPageNumber, printedSpread: activity.spread,
      sourceInteractionType: activity.publisherInteractionTypes, visibleSectionName: sectionByPart.get(activity.partNumber), visibleExerciseNumber: exercise,
      title: implementationTitle(activity, exercise), visibleInstructionText: instructionsById[shortId] || null,
      questionPromptText: questions.map((question) => question.prompt), optionText: questions.map((question) => question.options.map((option) => option.text)),
      explicitAnswerEvidenceStatus: answerStatus,
      normalizedAnswerRecords: evidenceRecords,
      mediaDependencies, imageDependencies: activity.imageDependencies.filter((dependency) => /\.(png|jpe?g)$/i.test(dependency.sourceRelativePath || "")),
      requiredLearnerInteraction: mode === "auto-scored" ? (questions.some((question) => question.options.length) ? "select or match the explicit response" : "enter a short response") : mode === "teacher-reviewed" ? "enter and submit an open response" : mode === "unscored-practice" ? "complete the practice without a grade" : "none",
      implementationMode: mode, scoringMode: mode === "auto-scored" ? "authoritative-explicit-answer" : mode === "teacher-reviewed" ? "pending-teacher-review" : "unscored",
      availability: enabled ? "enabled" : "disabled", implementationStatus: enabled ? "implemented-normalized-react" : "disabled-editorial-only", editorialStatus: enabled ? "reviewed-evidence-backed" : "manual-review-required",
      sourceProvenance,
      extractionWarnings: [...new Set([...activity.extractionWarnings, ...warnings, ...(mode === "unsupported-disabled" ? ["Hidden from students; retained only as a teacher/editorial diagnostic."] : []), ...(["spinningWheel", "score4"].some((type) => activity.publisherInteractionTypes.includes(type)) ? ["Unsupported legacy game semantics are intentionally not reproduced."] : [])])],
      manuallyVerifiedSourceFields: ["visibleSectionName", "visibleExerciseNumber", "title", "visibleInstructionText", "questionPromptText", "optionText", "printedPage", "printedSpread"],
      unknownFields: mode === "unsupported-disabled" ? ["supported interaction semantics"] : answerStatus.startsWith("partial") ? ["complete authoritative answer set"] : [],
      fieldProvenance: { visibleSectionName: visualProvenance(activity), visibleExerciseNumber: visualProvenance(activity), title: visualProvenance(activity), visibleInstructionText: visualProvenance(activity), questionPromptText: questions.map(() => manualMultipleChoiceById[shortId] || manualPromptsById[shortId] || unscoredQuestionsById[shortId] ? visualProvenance(activity) : `${sourcePathFor(activity)}#decoded-visible-text`), optionText: questions.map((question) => question.options.length ? (manualMultipleChoiceById[shortId] || unscoredQuestionsById[shortId] ? visualProvenance(activity) : `${sourcePathFor(activity)}#decoded-options`) : null), normalizedAnswerRecords: evidenceRecords.map((record) => record.source) },
      runtime: { questions },
    });
  }
  const summary = Object.fromEntries([...allowedModes].map((mode) => [mode, records.filter((record) => record.implementationMode === mode).length]));
  const relevantImages = new Set(records.flatMap((record) => record.imageDependencies.map((dependency) => dependency.sourceRelativePath)));
  return { schemaVersion: "1.0", book: "ultimate-b2", component: "students-book", unitNumber: 1, printedPageRange: "5-18", spreadCount: 10, definitePublisherObjectCount: 39, mediaOnlyObjectCount: 16, nonExerciseDisplayObjectCount: 14, sourceAssetSummary: { hdPageImages: 10, sdPageImages: 10, audioFiles: 35, primaryPlayableAudioMappings: 6, publisherHighlightAudioSegments: 29, videoFiles: 5, playableVideoMappings: 5, objectImageFiles: 140, relevantImageDependencies: relevantImages.size }, deterministicOrder: "partNumber, publisher object order", automaticPublication: false, feedbackPolicy: "Publisher feedback is not exposed. All UI status labels are application-generated neutral feedback.", activities: records, summary: { ...summary, active: records.filter((record) => record.availability === "enabled").length, disabled: records.filter((record) => record.availability === "disabled").length, explicitAnswerObjects: records.filter((record) => record.explicitAnswerEvidenceStatus !== "none").length, missingAnswerObjects: records.filter((record) => record.explicitAnswerEvidenceStatus === "none").length } };
}

function implementationReport(matrix) {
  const lines = ["# Ultimate B2 Students Book Unit 1 implementation report", "", `The matrix classifies all ${matrix.definitePublisherObjectCount} definite publisher activity objects exactly once across printed pages ${matrix.printedPageRange}. ${matrix.summary.active} are safely enabled and ${matrix.summary.disabled} remain disabled rather than guessed.`, "", "## Summary", "", "| Mode | Count |", "| --- | ---: |", ...[...allowedModes].map((mode) => `| ${mode} | ${matrix.summary[mode]} |`), `| active | ${matrix.summary.active} |`, `| disabled | ${matrix.summary.disabled} |`, `| explicit answer evidence | ${matrix.summary.explicitAnswerObjects} |`, `| missing explicit answer evidence | ${matrix.summary.missingAnswerObjects} |`, "", "## Deterministic activity classification", "", "| Stable ID | Page / spread | Exercise | Source interaction | Mode | Status |", "| --- | --- | --- | --- | --- | --- |", ...matrix.activities.map((activity) => `| ${activity.stableNormalizedId} | ${activity.printedPage} / ${activity.printedSpread} | ${activity.visibleExerciseNumber ?? "—"} | ${activity.sourceInteractionType.join(", ")} | ${activity.implementationMode} | ${activity.implementationStatus} |`), "", "Auto-scored records pair manually verified visible prompts/options with explicit decoded publisher answer fields. Teacher-reviewed records store a null automatic score and await same-school teacher review. Unscored practice records never fabricate a grade. Unsupported legacy games are hidden from students.", ""];
  return lines.join("\n");
}

function migrationSqlForLegacySchemaNames(matrix) {
  const enabled = matrix.activities.filter((activity) => activity.availability === "enabled").map((activity) => ({ stableNormalizedId: activity.stableNormalizedId, partNumber: activity.partNumber, printedPage: activity.printedPage, title: activity.title, instructions: activity.visibleInstructionText, implementationMode: activity.implementationMode, activityType: activity.implementationMode === "teacher-reviewed" ? "teacher_reviewed_response" : activity.implementationMode === "unscored-practice" ? "unscored_practice" : "normalized_students_book", questions: activity.runtime.questions.map((question) => ({ number: question.number, prompt: question.prompt, questionType: question.options.length ? "multiple_choice" : activity.implementationMode === "teacher-reviewed" ? "long_text" : "typed_short_answer", acceptedAnswers: activity.implementationMode === "auto-scored" ? question.acceptedAnswers : [], options: question.options.map((option) => option.text) })) }));
  return `-- Additive Unit 1 recovered activities. Apply after migration 020.\n-- Authoritative answers remain server-side in questions.feedback_json.\n\nbegin;\n\ndo $migration$\ndeclare\n  package_uuid uuid; component_uuid uuid; unit_uuid uuid; lesson_uuid uuid; activity_uuid uuid; question_uuid uuid;\n  activity_record jsonb; question_record jsonb; option_record record;\nbegin\n  select id into package_uuid from book_packages where slug = 'ultimate-b2' order by created_at limit 1;\n  if package_uuid is null then raise notice 'Ultimate B2 package is not present; Unit 1 migration skipped.'; return; end if;\n  select id into component_uuid from book_components where book_package_id = package_uuid and lower(coalesce(slug, '')) in ('students-book', 'student-book') order by created_at limit 1;\n  if component_uuid is null then raise notice 'Ultimate B2 Students Book component is not present; Unit 1 migration skipped.'; return; end if;\n  insert into book_units (book_component_id, title, slug, unit_number, sort_order, status) values (component_uuid, 'Unit 1', 'unit-1', 1, 1, 'published') on conflict (book_component_id, slug) do update set title=excluded.title, unit_number=excluded.unit_number, sort_order=excluded.sort_order;\n  select id into unit_uuid from book_units where book_component_id=component_uuid and slug='unit-1' limit 1;\n  insert into lessons (book_unit_id, title, slug, sort_order, status) values (unit_uuid, 'Recovered Students Book activities', 'recovered-students-book-activities', 100, 'published') on conflict (book_unit_id, slug) do update set title=excluded.title, sort_order=excluded.sort_order;\n  select id into lesson_uuid from lessons where book_unit_id=unit_uuid and slug='recovered-students-book-activities' limit 1;\n  for activity_record in select value from jsonb_array_elements('${JSON.stringify(enabled).replaceAll("'", "''")}'::jsonb) loop\n    insert into activities (lesson_id, title, slug, type, activity_type, instructions, content, content_json, settings_json, sort_order, is_assignable, is_demo_active) values (lesson_uuid, activity_record->>'title', activity_record->>'stableNormalizedId', activity_record->>'activityType', activity_record->>'activityType', activity_record->>'instructions', jsonb_build_object('printedPage', (activity_record->>'printedPage')::int), jsonb_build_object('publisherSourceActivityId', activity_record->>'stableNormalizedId', 'implementationMode', activity_record->>'implementationMode', 'feedbackSource', 'application-generated-neutral'), '{}'::jsonb, (activity_record->>'partNumber')::int * 100, (activity_record->>'implementationMode') in ('auto-scored','teacher-reviewed'), true) on conflict (lesson_id, slug) do update set title=excluded.title, type=excluded.type, activity_type=excluded.activity_type, instructions=excluded.instructions, content=excluded.content, content_json=excluded.content_json, settings_json=excluded.settings_json, sort_order=excluded.sort_order, is_assignable=excluded.is_assignable, is_demo_active=excluded.is_demo_active;\n    select id into activity_uuid from activities where lesson_id=lesson_uuid and slug=activity_record->>'stableNormalizedId' limit 1;\n    for question_record in select value from jsonb_array_elements(activity_record->'questions') loop\n      insert into questions (activity_id, question_number, prompt, question_type, content_json, feedback_json, sort_order) values (activity_uuid, (question_record->>'number')::int, question_record->>'prompt', question_record->>'questionType', '{}'::jsonb, jsonb_build_object('acceptedAnswers', coalesce(question_record->'acceptedAnswers','[]'::jsonb), 'source', case when activity_record->>'implementationMode'='auto-scored' then 'decoded-publisher-explicit-answer' else 'none-open-or-unscored-response' end, 'feedbackSource','application-generated-neutral'), (question_record->>'number')::int) on conflict (activity_id, question_number) do update set prompt=excluded.prompt, question_type=excluded.question_type, content_json=excluded.content_json, feedback_json=excluded.feedback_json, sort_order=excluded.sort_order;\n      select id into question_uuid from questions where activity_id=activity_uuid and question_number=(question_record->>'number')::int limit 1;\n      for option_record in select value, ordinal from jsonb_array_elements_text(coalesce(question_record->'options','[]'::jsonb)) with ordinality as option_row(value, ordinal) loop\n        insert into question_options (question_id, option_label, option_text, is_correct, sort_order) values (question_uuid, option_record.value, option_record.value, coalesce(question_record->'acceptedAnswers','[]'::jsonb) ? option_record.value, option_record.ordinal) on conflict (question_id, option_label) do update set option_text=excluded.option_text, is_correct=excluded.is_correct, sort_order=excluded.sort_order;\n      end loop;\n    end loop;\n  end loop;\nend\n$migration$;\n\ncommit;\n`;
}

function migrationSql(matrix) {
  return migrationSqlForLegacySchemaNames(matrix)
    .replace(
      "where book_package_id = package_uuid and lower(coalesce(slug, '')) in ('students-book', 'student-book')",
      "where book_package_id = package_uuid and slug = 'ultimate-b2-students-book'",
    )
    .replace(
      "insert into book_units (book_component_id, title, slug, unit_number, sort_order, status) values (component_uuid, 'Unit 1', 'unit-1', 1, 1, 'published')",
      "insert into units (book_component_id, title, slug, unit_number, sort_order) values (component_uuid, 'Unit 1', 'unit-1', 1, 1)",
    )
    .replaceAll("book_units", "units")
    .replaceAll("book_unit_id", "unit_id");
}

export async function writeUnit01ImplementationOutputs(matrix, { root = outputRoot } = {}) {
  await mkdir(root, { recursive: true });
  await writeDeterministicJson(path.join(root, "unit-01.implementation-matrix.json"), matrix);
  await writeFile(path.join(root, "unit-01.implementation-report.md"), implementationReport(matrix), "utf8");
  await writeDeterministicJson(frontendOutput, { schemaVersion: matrix.schemaVersion, book: matrix.book, component: matrix.component, unitNumber: matrix.unitNumber, activities: matrix.activities.map((activity) => ({ stableNormalizedId: activity.stableNormalizedId, unitNumber: activity.unitNumber, partNumber: activity.partNumber, printedPage: activity.printedPage, title: activity.title, visibleInstructionText: activity.visibleInstructionText, implementationMode: activity.implementationMode, scoringMode: activity.scoringMode, availability: activity.availability, implementationStatus: activity.implementationStatus, mediaDependencies: activity.mediaDependencies.filter((dependency) => dependency.logicalKey).map(({ sourceRelativePath: _sourceRelativePath, sourceExistsAtGeneration: _sourceExistsAtGeneration, ...dependency }) => dependency), imageIdentities: activity.imageDependencies.map((dependency) => dependency.id), readiness: { interaction: activity.availability === "enabled", media: activity.mediaDependencies.every((dependency) => dependency.sourceExistsAtGeneration) }, runtime: { questions: activity.runtime.questions.map((question) => ({ id: question.id, number: question.number, prompt: question.prompt, options: question.options, sourceType: question.sourceType })) } })) });
  await writeFile(migrationOutput, migrationSql(matrix), "utf8");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const matrix = await buildUnit01ImplementationMatrix();
  await writeUnit01ImplementationOutputs(matrix);
  console.log(JSON.stringify({ activities: matrix.activities.length, ...matrix.summary, output: "books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json" }, null, 2));
}
