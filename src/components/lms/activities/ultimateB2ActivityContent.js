export const QUIZ_DURATION_SECONDS = 20 * 60;

export const readingText = [
  "When Maya joined a weekend science club, she expected to build simple models and follow instructions. Instead, she found a box of damaged bicycle lights and a challenge: make something useful from parts that most people would throw away.",
  "At first, Maya copied ideas from online tutorials, but none of them worked with the materials she had. She began testing different circuits and recording every failed attempt in a notebook. After three weeks, she had created a small lamp that could be charged by turning a bicycle wheel.",
  "The project changed when a local delivery rider visited the club and explained that many cyclists needed brighter lights for narrow evening streets. Maya redesigned her lamp so it could be clipped onto a bag as well as a bike. This decision made the invention more flexible and easier to use.",
  "Maya did not win the regional competition, but a community workshop asked her to show younger students how to reuse old electronic parts. She later said that the most useful part of the project was not the lamp itself, but learning how to improve an idea after listening to real users.",
];

export const readingExercise3 = [
  {
    id: "r3-1",
    question: "What surprised Maya about the weekend science club?",
    options: ["She had to solve a real design problem.", "She was asked to buy new equipment.", "She had to work without a notebook."],
    answer: "She had to solve a real design problem.",
  },
  {
    id: "r3-2",
    question: "Why did Maya keep a notebook?",
    options: ["To record failed attempts and improve her design.", "To copy online tutorials exactly.", "To prepare for a cycling race."],
    answer: "To record failed attempts and improve her design.",
  },
  {
    id: "r3-3",
    question: "What caused Maya to redesign the lamp?",
    options: ["A delivery rider described a practical problem.", "The competition judges gave her a prize.", "The bicycle wheel stopped turning."],
    answer: "A delivery rider described a practical problem.",
  },
  {
    id: "r3-4",
    question: "What did Maya value most by the end?",
    options: ["Learning from real users.", "Winning the regional competition.", "Throwing away old parts."],
    answer: "Learning from real users.",
  },
];

export const readingExercise4 = [
  {
    id: "r4-1",
    prompt: "Which paragraph mentions the main character's decision?",
    answer: "Paragraph 3",
    feedback: "The decision to redesign the lamp is clearly stated in paragraph 3.",
  },
  {
    id: "r4-2",
    prompt: "Where do we learn that failure helped the project?",
    answer: "Paragraph 2",
    feedback: "Paragraph 2 describes testing circuits and recording failed attempts.",
  },
  {
    id: "r4-3",
    prompt: "Write one short reason why the invention became more useful.",
    answer: "It could be clipped onto a bag as well as a bike.",
    feedback: "The answer should mention the flexible bag-and-bike design.",
  },
];

export const listeningQuestions = [
  { id: "l-1", type: "choice", question: "What is the main purpose of the conversation?", options: ["To plan a class project", "To complain about homework", "To buy a bicycle"], answer: "To plan a class project" },
  { id: "l-2", type: "true-false", question: "The students decide to interview people before choosing a final idea.", options: ["True", "False"], answer: "True" },
  { id: "l-3", type: "choice", question: "Which problem do they mention?", options: ["Poor lighting near the park", "Expensive train tickets", "A missing textbook"], answer: "Poor lighting near the park" },
  { id: "l-4", type: "true-false", question: "The teacher wants a written plan by Friday.", options: ["True", "False"], answer: "True" },
  { id: "l-5", type: "choice", question: "What will the students do next?", options: ["Prepare interview questions", "Cancel the project", "Watch a film"], answer: "Prepare interview questions" },
];

export const grammarOpening = [
  { id: "go-1", prompt: "By the time Maya arrived, the club ___ already started.", options: ["had", "has", "was"], answer: "had" },
  { id: "go-2", prompt: "The lamp was redesigned ___ it could fit on a bag.", options: ["so that", "although", "unless"], answer: "so that" },
  { id: "go-3", prompt: "Maya kept testing ___ the circuit worked.", options: ["until", "despite", "whereas"], answer: "until" },
  { id: "go-4", prompt: "If she had ignored the rider, the design ___ less practical.", options: ["would have been", "will be", "is being"], answer: "would have been" },
];

export const grammarExercise4 = [
  { id: "g4-1", question: "Choose the correct transformation: She listened to users. She improved the design.", options: ["Having listened to users, she improved the design.", "Listening users, she improves design.", "She improved because listen users."], answer: "Having listened to users, she improved the design." },
  { id: "g4-2", question: "Which sentence is correct?", options: ["The lamp was made from reused parts.", "The lamp made from reused parts.", "The lamp was make from reused parts."], answer: "The lamp was made from reused parts." },
  { id: "g4-3", question: "Pick the best linker.", options: ["Although she did not win, she learned a lot.", "Because she did not win, but she learned a lot.", "Despite she did not win, she learned a lot."], answer: "Although she did not win, she learned a lot." },
  { id: "g4-4", question: "Complete: The design became ___ practical after the interview.", options: ["more", "most", "much than"], answer: "more" },
  { id: "g4-5", question: "Complete: She wished she ___ asked users earlier.", options: ["had", "has", "would"], answer: "had" },
];

export const quizQuestions = [
  ...readingExercise3.slice(0, 3).map((item) => ({ id: `q-${item.id}`, question: item.question, options: item.options, answer: item.answer })),
  { id: "q-v1", question: "Which word is closest to flexible?", options: ["adaptable", "expensive", "damaged"], answer: "adaptable" },
  { id: "q-v2", question: "Which phrase means throw away?", options: ["discard", "clip on", "turn up"], answer: "discard" },
  ...grammarExercise4.slice(0, 5).map((item) => ({ id: `q-${item.id}`, question: item.question, options: item.options, answer: item.answer })),
];
