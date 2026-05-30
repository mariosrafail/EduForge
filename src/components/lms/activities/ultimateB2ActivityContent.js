export const QUIZ_DURATION_SECONDS = 20 * 60;

export const readingText = [
  {
    id: "p1",
    text: "The Beechcraft Bonanza climbed into the morning sky. It had just taken off on its routine journey from Andros Island, Bahamas to Miami, Florida. When the small plane reached 3,500 feet (1,066 m), pilot Bruce Gernon noticed a huge black cloud moving into his flight path. It was growing bigger and bigger, and he realised to his horror that he had no choice but to fly straight through it.",
  },
  {
    id: "p2",
    parts: [
      "Bruce was an experienced pilot, and he was used to making this trip. It was only a 90-minute journey, and until that day, it had always gone perfectly. The fact that it followed a route through the Bermuda Triangle had never worried Bruce before. Over the years, around 2,000 ships and 200 planes had gone missing in this area.",
      { gap: 1 },
      "As he hit the cloud, everything around the plane turned black as night. Although he was feeling extremely anxious, Bruce found the strength to stay calm and focused on flying the plane.",
    ],
  },
  {
    id: "p3",
    parts: [
      "Then, all of a sudden, flashes of brilliant white light started appearing around the plane.",
      { gap: 2 },
      "So, what could it be? Thoughts raced wildly in his mind as he kept the plane on course through the blinding light. The Beechcraft Bonanza had been travelling inside the cloud for about thirty minutes when Bruce started to feel like he was in a never-ending tunnel. At that point, he wondered if he and his two passengers would ever make it out of the cloud alive.",
    ],
  },
  {
    id: "p4",
    parts: [
      "As the tunnel cloud seemed to close around the small plane, its electronic equipment stopped functioning properly.",
      { gap: 3 },
      "Bruce was no longer able to navigate, but he refused to give up hope. Suddenly, he saw daylight through the darkness. Luckily, the plane managed to escape the cloud and found open blue sky once again. Everyone breathed a sigh of relief.",
    ],
  },
  {
    id: "p5",
    parts: [
      "Fearing that they had been blown off course, the pilot immediately contacted the air traffic controllers at Miami airport to check his plane's position. However, the air traffic controllers couldn't locate the plane on their radar. Then, to Bruce's amazement, they announced that the plane was already inside the Miami air space.",
      { gap: 4 },
      "This just added to the confusion. Surely that was impossible as this was a 90-minute journey!",
    ],
  },
  {
    id: "p6",
    parts: [
      "Suddenly, Bruce saw the runways and the terminal buildings at Miami Airport. He was indeed where the controllers had said he was! As the plane safely touched down on the runway, Bruce asked himself how they could have reached their destination so quickly. To make matters even more confusing, only half of the fuel needed had been used up.",
      { gap: 5 },
      "It didn't make any sense!",
    ],
  },
  {
    id: "p7",
    parts: [
      "According to some experts, nature sometimes creates a kind of electric fog in which ships and planes can get trapped.",
      { gap: 6 },
      "After many years of research and talking to scientists, Bruce came to the conclusion that it must have been electric fog that he experienced that day. He is convinced that it acted like an accelerator to fast-track his Beechcraft Bonanza to its destination!",
    ],
  },
];

// TODO: add synced reading highlights in a later phase.

export const readingExercise3 = [
  { gap: 1, answer: "F" },
  { gap: 2, answer: "C" },
  { gap: 3, answer: "E" },
  { gap: 4, answer: "A" },
  { gap: 5, answer: "G" },
  { gap: 6, answer: "B" },
];

export const readingExercise3Options = [
  { id: "A", text: "Moreover, the plane's clock showed that it had only been travelling for 45 minutes." },
  { id: "B", text: "What's more, it's possible for boats and aircraft to completely disappear and slip into another dimension when they hit this fog!" },
  { id: "C", text: "However, Bruce knew that it wasn't lightning." },
  { id: "D", text: "It had been the journey of a lifetime!" },
  { id: "E", text: "For example, the compass started turning anti-clockwise and it appeared that a force outside the plane was now controlling it." },
  { id: "F", text: "Unlike the captains and pilots of those ships and planes, Bruce lived to tell an extraordinary tale." },
  { id: "G", text: "Had the plane become some kind of time machine that allowed them to travel through space and time?" },
];

export const readingExercise4 = [
  { id: "r4-1", before: "Pilots need permission to enter another country's", options: ["air space", "radar"], answer: "air space", after: "." },
  { id: "r4-2", before: "Mobile phones should be switched off until you are inside the", options: ["runway", "terminal"], answer: "terminal", after: "building." },
  { id: "r4-3", before: "Can you", options: ["locate", "control"], answer: "locate", after: "where we are on this map?" },
  { id: "r4-4", before: "Many physicists believe it's possible to travel to other", options: ["courses", "dimensions"], answer: "dimensions", after: "." },
  { id: "r4-5", before: "Air traffic", options: ["pilots", "controllers"], answer: "controllers", after: "guide planes from the control tower." },
  { id: "r4-6", before: "To his", options: ["amazement", "horror"], answer: "amazement", after: ", he had kept the plane on course." },
  { id: "r4-7", before: "The plane", options: ["took", "touched"], answer: "touched", after: "down smoothly despite the windy conditions." },
  { id: "r4-8", before: "GPS technology calculates the fastest", options: ["route", "road"], answer: "route", after: "to your destination." },
];

export const listeningGapFillItems = [
  {
    id: "lgf-1",
    prompt: "Alex says that if they want to be warmer, people should go to the ___ part of the boat.",
    before: "Alex says that if they want to be warmer, people should go to the",
    after: "part of the boat.",
    answer: "lower",
    acceptedAnswers: ["lower"],
  },
  {
    id: "lgf-2",
    prompt: "The river cruise will take ___ hours in total.",
    before: "The river cruise will take",
    after: "hours in total.",
    answer: "four",
    acceptedAnswers: ["four", "4"],
  },
  {
    id: "lgf-3",
    prompt: "A River Pass allows tourists to get off the boat in the ___.",
    before: "A River Pass allows tourists to get off the boat in the",
    after: ".",
    answer: "city centre",
    acceptedAnswers: ["city centre", "city center"],
  },
  {
    id: "lgf-4",
    prompt: "Roman invaders built the first bridge across the Thames ___ ago.",
    before: "Roman invaders built the first bridge across the Thames",
    after: "ago.",
    answer: "2000 years",
    acceptedAnswers: ["2000 years", "2,000 years"],
  },
  {
    id: "lgf-5",
    prompt: "Long ago, many sections of the river would ___ over completely in winter.",
    before: "Long ago, many sections of the river would",
    after: "over completely in winter.",
    answer: "freeze",
    acceptedAnswers: ["freeze"],
  },
  {
    id: "lgf-6",
    prompt: "During 'Frost Fairs', dancing and ___ took place on the ice.",
    before: "During 'Frost Fairs', dancing and",
    after: "took place on the ice.",
    answer: "sports",
    acceptedAnswers: ["sports"],
  },
  {
    id: "lgf-7",
    prompt: "In the 1950s, the Thames was said to be a ___ river.",
    before: "In the 1950s, the Thames was said to be a",
    after: "river.",
    answer: "dead",
    acceptedAnswers: ["dead"],
  },
  {
    id: "lgf-8",
    prompt: "Alex explains that now, even ___ occasionally swim up the river.",
    before: "Alex explains that now, even",
    after: "occasionally swim up the river.",
    answer: "sharks",
    acceptedAnswers: ["sharks"],
  },
  {
    id: "lgf-9",
    prompt: "The movement of sea water can sometimes cause ___ in London.",
    before: "The movement of sea water can sometimes cause",
    after: "in London.",
    answer: "floods",
    acceptedAnswers: ["floods"],
  },
  {
    id: "lgf-10",
    prompt: "Annually, ___ million tourists ride on the London Eye.",
    before: "Annually,",
    after: "million tourists ride on the London Eye.",
    answer: "3.5",
    acceptedAnswers: ["3.5", "three point five"],
  },
];

export const grammarOpening = [
  { id: "go-1", prompt: "By the time Maya arrived, the club ___ already started.", options: ["had", "has", "was"], answer: "had" },
  { id: "go-2", prompt: "The lamp was redesigned ___ it could fit on a bag.", options: ["so that", "although", "unless"], answer: "so that" },
  { id: "go-3", prompt: "Maya kept testing ___ the circuit worked.", options: ["until", "despite", "whereas"], answer: "until" },
  { id: "go-4", prompt: "If she had ignored the rider, the design ___ less practical.", options: ["would have been", "will be", "is being"], answer: "would have been" },
];

export const grammarExercise4 = [
  {
    id: "g4-1",
    firstSentence: "I woke up this morning.",
    secondSentence: "It was snowing.",
    connector: "when",
    prompt: "I woke up this morning. It was snowing. when",
    answer: "When I woke up this morning, it was snowing.",
  },
  {
    id: "g4-2",
    firstSentence: "I was studying.",
    secondSentence: "I suddenly felt sleepy.",
    connector: "while",
    prompt: "I was studying. I suddenly felt sleepy. while",
    answer: "While I was studying, I suddenly felt sleepy.",
  },
  {
    id: "g4-3",
    firstSentence: "I was walking home.",
    secondSentence: "I ran into a friend of mine.",
    connector: "as",
    prompt: "I was walking home. I ran into a friend of mine. as",
    answer: "As I was walking home, I ran into a friend of mine.",
  },
  {
    id: "g4-4",
    firstSentence: "I made the final decision.",
    secondSentence: "I felt a lot more relaxed.",
    connector: "as soon as",
    prompt: "I made the final decision. I felt a lot more relaxed. as soon as",
    answer: "As soon as I made the final decision, I felt a lot more relaxed.",
  },
  {
    id: "g4-5",
    firstSentence: "I heard him come in.",
    secondSentence: "We were having dinner.",
    connector: "while",
    prompt: "I heard him come in. We were having dinner. while",
    answer: "I heard him come in while we were having dinner.",
  },
  {
    id: "g4-6",
    firstSentence: "We were packing for our trip.",
    secondSentence: "The power went off.",
    connector: "when",
    prompt: "We were packing for our trip. The power went off. when",
    answer: "We were packing for our trip when the power went off.",
  },
];

export const grammarRuleSections = [
  {
    id: "past-simple",
    title: "Past simple",
    form: [
      "I / You / He / She / It / We / They travelled.",
      "Did I / you / he / she / it / we / they travel?",
      "I / You / He / She / It / We / They did not (didn't) travel.",
    ],
    use: [
      "κάτι που ξεκίνησε και ολοκληρώθηκε στο παρελθόν, σε χρονική στιγμή που αναφέρεται",
      "συνήθειες που είχαμε στο παρελθόν, συχνά με επιρρήματα συχνότητας",
      "περιστάσεις ή καταστάσεις που ίσχυαν στο παρελθόν αλλά δεν ισχύουν τώρα",
      "πράγματα που συνέβησαν το ένα μετά το άλλο στο παρελθόν, για παράδειγμα όταν αφηγούμαστε μια ιστορία",
      "πράξεις που συνέβησαν στο παρελθόν και δε θα συμβούν ξανά",
    ],
    examples: [
      "We went on a cruise around the Mediterranean two years ago.",
      "He always felt anxious about flying.",
      "She spent most of her time abroad when she worked as a sales manager.",
      "I grabbed my suitcase, closed the door behind me and stormed out of the house.",
      "My brother graduated from college last June.",
    ],
    timeExpressions: "yesterday, last night/week/month/summer, week/month/year ago, twice a week, once a month, at the weekend, in March, in the morning/afternoon/evening, at night, on Thursdays, on Monday mornings, in 2020",
  },
  {
    id: "past-continuous",
    title: "Past continuous",
    form: [
      "I / He / She / It was travelling.",
      "We / You / They were travelling.",
      "Was I / he / she / it travelling?",
      "Were we / you / they travelling?",
      "I / He / She / It was not (wasn't) travelling.",
      "We / You / They were not (weren't) travelling.",
    ],
    use: [
      "μια πράξη που ήταν σε εξέλιξη σε συγκεκριμένη χρονική στιγμή στο παρελθόν",
      "δύο ή περισσότερες πράξεις που συνέβαιναν ταυτόχρονα στο παρελθόν",
      "μια πράξη που ενώ ήταν σε εξέλιξη στο παρελθόν διακόπηκε από μια άλλη",
      "για να περιγράψουμε το σκηνικό μιας ιστορίας",
    ],
    examples: [
      "I was packing for my camping trip at eight o'clock last night.",
      "I was booking a hotel online while my brother was looking for his passport.",
      "He was downloading an app when his phone crashed.",
      "It was a nightmare! It was raining heavily and the wind was blowing strongly.",
    ],
    timeExpressions: "while, as, when, all day/week/month/year, at ten o'clock last night, last Sunday/week/year, this/that morning, this time last week/yesterday/year",
  },
  {
    id: "used-to",
    title: "Used to",
    form: [
      "I / You / He / She / It / We / They used to work.",
      "Did I / you / he / she / it / we / they use to work?",
      "I / You / He / She / It / We / They did not (didn't) use to work.",
    ],
    use: [
      "πράγματα που κάναμε συχνά στο παρελθόν αλλά δεν κάνουμε τώρα πια",
      "περιστάσεις ή καταστάσεις που ίσχυαν στο παρελθόν αλλά δεν ισχύουν τώρα",
    ],
    examples: [
      "When my brother and I were younger, we used to go on camping trips.",
      "Harry used to commute to work, but now he's moved to a flat near his office.",
      "I used to be afraid of heights, but I've got over it lately.",
    ],
    notes: [
      "Χρησιμοποιούμε το would + bare infinitive όπως το used to για να μιλήσουμε για συνήθειες που είχαμε ή πράξεις που κάναμε συχνά στο παρελθόν.",
      "On Sundays, my best friend and I would go fishing in the river.",
      "Προσέχουμε όμως ότι όταν περιγράφουμε καταστάσεις που ίσχυαν στο παρελθόν, χρησιμοποιούμε μόνο used to και όχι would.",
      "Correct: Ron used to like road trips.",
      "Incorrect: Ron would like road trips.",
    ],
  },
];

export const grammarQuizQuestions = [
  { id: "gq-1", question: "Choose the correct transformation: She listened to users. She improved the design.", options: ["Having listened to users, she improved the design.", "Listening users, she improves design.", "She improved because listen users."], answer: "Having listened to users, she improved the design." },
  { id: "gq-2", question: "Which sentence is correct?", options: ["The lamp was made from reused parts.", "The lamp made from reused parts.", "The lamp was make from reused parts."], answer: "The lamp was made from reused parts." },
  { id: "gq-3", question: "Pick the best linker.", options: ["Although she did not win, she learned a lot.", "Because she did not win, but she learned a lot.", "Despite she did not win, she learned a lot."], answer: "Although she did not win, she learned a lot." },
  { id: "gq-4", question: "Complete: The design became ___ practical after the interview.", options: ["more", "most", "much than"], answer: "more" },
  { id: "gq-5", question: "Complete: She wished she ___ asked users earlier.", options: ["had", "has", "would"], answer: "had" },
];

export const quizQuestions = [
  {
    id: "quiz2-1",
    question: "The pilot couldn't see the runway, so he had to rely on the ___ to help him land the plane.",
    options: ["A. passengers", "B. routes", "C. terminal", "D. radar"],
    answer: "D. radar",
  },
  {
    id: "quiz2-2",
    question: "They ___ on their one-year-long trip around the world in the winter of 2019.",
    options: ["A. picked up", "B. set off", "C. stopped off", "D. saw off"],
    answer: "B. set off",
  },
  {
    id: "quiz2-3",
    question: "___ who use public transport often arrive at work more relaxed than people who drive.",
    options: ["A. Crews", "B. Journeys", "C. Commuters", "D. Motorists"],
    answer: "C. Commuters",
  },
  {
    id: "quiz2-4",
    question: "I can't ___ the hotel on this map. Can you help me find it?",
    options: ["A. locate", "B. control", "C. touch", "D. take"],
    answer: "A. locate",
  },
  {
    id: "quiz2-5",
    question: "Do you think time travel will be possible in the future? Many scientists believe that we can already travel to other ___!",
    options: ["A. dimensions", "B. courses", "C. runways", "D. routes"],
    answer: "A. dimensions",
  },
  {
    id: "quiz2-6",
    question: "It took more than an hour to board the coach. I had to stand in the ___ for ages!",
    options: ["A. jam", "B. delay", "C. queue", "D. location"],
    answer: "C. queue",
  },
  {
    id: "quiz2-7",
    question: "Our plane had some technical problems, so the pilot had to make an emergency ___.",
    options: ["A. delay", "B. control", "C. runway", "D. landing"],
    answer: "D. landing",
  },
  {
    id: "quiz2-8",
    question: "Good morning. I have to ___ my reservation due to illness. Is it possible to get my deposit back?",
    options: ["A. wait", "B. cancel", "C. book", "D. take"],
    answer: "B. cancel",
  },
  {
    id: "quiz2-9",
    question: "I'm ___ from jetlag after my twelve-hour flight. I think I'll go to bed early.",
    options: ["A. hitting", "B. going", "C. taking", "D. suffering"],
    answer: "D. suffering",
  },
  {
    id: "quiz2-10",
    question: "We ___ sightseeing in Paris. Would you like to see my photos of the Eiffel Tower?",
    options: ["A. went", "B. caught", "C. took", "D. hit"],
    answer: "A. went",
  },
  {
    id: "quiz2-11",
    question: "I don't like places with lots of tourists. I prefer to go off the beaten ___.",
    options: ["A. road", "B. track", "C. route", "D. journey"],
    answer: "B. track",
  },
  {
    id: "quiz2-12",
    question: "There's no need to worry. They'll soon be home safe and ___!",
    options: ["A. wide", "B. sound", "C. around", "D. light"],
    answer: "B. sound",
  },
  {
    id: "quiz2-13",
    question: "Anna can't wait to spend time on the beach. She wants to ___ the sun.",
    options: ["A. light", "B. beat", "C. hit", "D. catch"],
    answer: "D. catch",
  },
  {
    id: "quiz2-14",
    question: "We got up at the crack of ___ to catch the early train. I'm exhausted!",
    options: ["A. day", "B. light", "C. dawn", "D. sun"],
    answer: "C. dawn",
  },
  {
    id: "quiz2-15",
    question: "What time does your flight take ___ tonight? If it's not too late, I can take you to the airport.",
    options: ["A. around", "B. up", "C. off", "D. out"],
    answer: "C. off",
  },
  {
    id: "quiz2-16",
    question: "Is it easy to get ___ Madrid? Is there good public transport or do I need to rent a car?",
    options: ["A. up", "B. out", "C. around", "D. off"],
    answer: "C. around",
  },
  {
    id: "quiz2-17",
    question: "It's 1.00 p.m. We can't check ___ the hotel before 2.00 p.m., so let's go find a place to eat first.",
    options: ["A. in", "B. into", "C. up", "D. inside"],
    answer: "B. into",
  },
  {
    id: "quiz2-18",
    question: "I'm not ___. I like to spend my holiday in the same place every year.",
    options: ["A. anxious", "B. memorable", "C. adventurous", "D. comfortable"],
    answer: "C. adventurous",
  },
  {
    id: "quiz2-19",
    question: "It wasn't a very ___ journey. There wasn't much to do and nothing exciting happened.",
    options: ["A. disastrous", "B. ordinary", "C. harmful", "D. eventful"],
    answer: "D. eventful",
  },
  {
    id: "quiz2-20",
    question: "Today is an important ___ holiday. There are celebrations all over the country.",
    options: ["A. national", "B. package", "C. seasonal", "D. native"],
    answer: "A. national",
  },
  {
    id: "quiz2-21",
    question: "This time last month, we ___ to China! It seems like a long time ago now.",
    options: ["A. used to fly", "B. had been flying", "C. were flying", "D. would fly"],
    answer: "C. were flying",
  },
  {
    id: "quiz2-22",
    question: "___ to your mother about our holiday plans last night?",
    options: ["A. Did you talk", "B. Had you talked", "C. Were you used to talking", "D. Had you been talking"],
    answer: "A. Did you talk",
  },
  {
    id: "quiz2-23",
    question: "When I got home yesterday, it ___ heavily.",
    options: ["A. used to rain", "B. would rain", "C. rained", "D. was raining"],
    answer: "D. was raining",
  },
  {
    id: "quiz2-24",
    question: "By the time we arrived at the station, our train ___, so we had to wait for the next one.",
    options: ["A. had left once", "B. had already left", "C. hadn't left yet", "D. already left"],
    answer: "B. had already left",
  },
  {
    id: "quiz2-25",
    question: "My brother and I ___ fight a lot when we were younger, but now we're close.",
    options: ["A. used", "B. use to", "C. would use", "D. used to"],
    answer: "D. used to",
  },
  {
    id: "quiz2-26",
    question: "Mickey ___ at the company for five years before he finally got a promotion.",
    options: ["A. used to work", "B. have worked", "C. had been working", "D. was working"],
    answer: "C. had been working",
  },
  {
    id: "quiz2-27",
    question: "Before he went to Florida last summer, he ___ the sea!",
    options: ["A. would never see", "B. never used to see", "C. had not been seeing", "D. had never seen"],
    answer: "D. had never seen",
  },
  {
    id: "quiz2-28",
    question: "This was Carol's favourite toy as a child. She ___ play with it for many hours every day.",
    options: ["A. use to", "B. used", "C. would", "D. were"],
    answer: "C. would",
  },
  {
    id: "quiz2-29",
    question: "As soon as the plane landed, I ___ my phone for messages.",
    options: ["A. had checked", "B. had been checking", "C. checked", "D. was checking"],
    answer: "C. checked",
  },
  {
    id: "quiz2-30",
    question: "Laura ___ for more than two hours before Pete finally picked her up from the airport. She was so angry!",
    options: ["A. was waiting", "B. had been waiting", "C. would wait", "D. used to wait"],
    answer: "B. had been waiting",
  },
  {
    id: "quiz2-31",
    question: "Three years ago, we ___ to sell our house and travel around the world.",
    options: ["A. decided", "B. were deciding", "C. have decided", "D. had been deciding"],
    answer: "A. decided",
  },
  {
    id: "quiz2-32",
    question: "Did you ___ go to the theatre often when you lived in London?",
    options: ["A. used", "B. used to", "C. use to", "D. would"],
    answer: "C. use to",
  },
  {
    id: "quiz2-33",
    question: "How long ___ in Madrid before you decided to learn Spanish?",
    options: ["A. would you stay", "B. did you use to stay", "C. were you staying", "D. had you been staying"],
    answer: "D. had you been staying",
  },
  {
    id: "quiz2-34",
    question: "When I called her, she had ___ got home from work.",
    options: ["A. just", "B. since", "C. yet", "D. ever"],
    answer: "A. just",
  },
  {
    id: "quiz2-35",
    question: "Unfortunately, we had already eaten when Keith ___ with a pizza.",
    options: ["A. was arriving", "B. arrived", "C. had arrived", "D. had been arriving"],
    answer: "B. arrived",
  },
  {
    id: "quiz2-36",
    question: "___ I had passed my exams, I applied to three different universities.",
    options: ["A. Before", "B. Already", "C. By the time", "D. Once"],
    answer: "D. Once",
  },
  {
    id: "quiz2-37",
    question: "They met ___ in Peru. They've been friends ever since that trip.",
    options: ["A. as soon as they hiked", "B. once they had hiked", "C. when they had been hiking", "D. while they were hiking"],
    answer: "D. while they were hiking",
  },
  {
    id: "quiz2-38",
    question: "Samantha would ___ to my house every Friday when we were children. We always had so much fun together.",
    options: ["A. come", "B. have been coming", "C. came", "D. coming"],
    answer: "A. come",
  },
  {
    id: "quiz2-39",
    question: "I ___ for my meeting at 11.00 p.m. last night. There was so much to do!",
    options: ["A. was still preparing", "B. still prepared", "C. have been preparing", "D. had always prepared"],
    answer: "A. was still preparing",
  },
  {
    id: "quiz2-40",
    question: "Why was William so tired yesterday morning? ___ all night long?",
    options: ["A. He had travelled", "B. He would travel", "C. Was he travelling", "D. Had he been travelling"],
    answer: "D. Had he been travelling",
  },
];
