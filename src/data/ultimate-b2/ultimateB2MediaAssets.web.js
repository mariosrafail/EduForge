const protectedStudentsBookMedia = (logicalKey) => ({
  logicalKey,
  localUrl: null,
  devFallbackUrl: import.meta.env.DEV
    ? `/.netlify/functions/ultimate-b2-media?logicalKey=${encodeURIComponent(logicalKey)}`
    : null,
});

export const ultimateB2ReadingVideo = protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.reading.video-intro");
export const ultimateB2ReadingAudio = protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.reading.text-audio");
export const ultimateB2ReadingTextImage = {
  logicalKey: "ultimate-b2.students-book.unit-2.reading.text-image",
  localUrl: null,
  devFallbackUrl: import.meta.env.DEV
    ? `/.netlify/functions/ultimate-b2-source-asset?logicalKey=${encodeURIComponent("ultimate-b2.students-book.unit-2.reading.text-image")}`
    : null,
};
export const ultimateB2WorkbookListeningAudio = { logicalKey: null, localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3" : null };
export const ultimateB2GrammarRulesImage = { logicalKey: null, localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/grammar-rules.jpg" : null };

export const ultimateB2Unit1Media = {
  "ultimate-b2.students-book.unit-1.reading.video-intro": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.reading.video-intro"),
  "ultimate-b2.students-book.unit-1.reading.text-audio": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.reading.text-audio"),
  "ultimate-b2.students-book.unit-1.reading.extra-video-1": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.reading.extra-video-1"),
  "ultimate-b2.students-book.unit-1.reading.extra-video-2": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.reading.extra-video-2"),
  "ultimate-b2.students-book.unit-1.reading.extra-video-3": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.reading.extra-video-3"),
  "ultimate-b2.students-book.unit-1.grammar.video-intro": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.grammar.video-intro"),
  "ultimate-b2.students-book.unit-1.listening.television-dialogue": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.listening.television-dialogue"),
  "ultimate-b2.students-book.unit-1.listening.six-situations": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.listening.six-situations"),
  "ultimate-b2.students-book.unit-1.listening.discussion-review": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.listening.discussion-review"),
  "ultimate-b2.students-book.unit-1.speaking.student-comparison": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.speaking.student-comparison"),
  "ultimate-b2.students-book.unit-1.practice.eight-situations": protectedStudentsBookMedia("ultimate-b2.students-book.unit-1.practice.eight-situations"),
};

export const ultimateB2Unit2Media = {
  [ultimateB2ReadingVideo.logicalKey]: ultimateB2ReadingVideo,
  [ultimateB2ReadingAudio.logicalKey]: ultimateB2ReadingAudio,
  "ultimate-b2.students-book.unit-2.grammar.video-intro": protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.grammar.video-intro"),
  "ultimate-b2.students-book.unit-2.listening.fjords": protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.listening.fjords"),
  "ultimate-b2.students-book.unit-2.listening.iceland-trip": protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.listening.iceland-trip"),
  "ultimate-b2.students-book.unit-2.speaking.photo-comparison": protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.speaking.photo-comparison"),
  "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha": protectedStudentsBookMedia("ultimate-b2.students-book.unit-2.practice.tristan-da-cunha"),
};

export const ultimateB2StudentsBookMedia = { ...ultimateB2Unit1Media, ...ultimateB2Unit2Media };
