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
