const protectedUnit2Media = (logicalKey) => ({
  logicalKey,
  localUrl: null,
  devFallbackUrl: import.meta.env.DEV
    ? `/.netlify/functions/ultimate-b2-media?logicalKey=${encodeURIComponent(logicalKey)}`
    : null,
});

export const ultimateB2ReadingVideo = protectedUnit2Media("ultimate-b2.students-book.unit-2.reading.video-intro");
export const ultimateB2ReadingAudio = protectedUnit2Media("ultimate-b2.students-book.unit-2.reading.text-audio");
export const ultimateB2ReadingTextImage = { logicalKey: "ultimate-b2.students-book.unit-2.reading.text-image", localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/student-text.jpg" : null };
export const ultimateB2WorkbookListeningAudio = { logicalKey: null, localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3" : null };
export const ultimateB2GrammarRulesImage = { logicalKey: null, localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/grammar-rules.jpg" : null };

export const ultimateB2Unit2Media = {
  [ultimateB2ReadingVideo.logicalKey]: ultimateB2ReadingVideo,
  [ultimateB2ReadingAudio.logicalKey]: ultimateB2ReadingAudio,
  "ultimate-b2.students-book.unit-2.grammar.video-intro": protectedUnit2Media("ultimate-b2.students-book.unit-2.grammar.video-intro"),
  "ultimate-b2.students-book.unit-2.listening.fjords": protectedUnit2Media("ultimate-b2.students-book.unit-2.listening.fjords"),
  "ultimate-b2.students-book.unit-2.listening.iceland-trip": protectedUnit2Media("ultimate-b2.students-book.unit-2.listening.iceland-trip"),
  "ultimate-b2.students-book.unit-2.speaking.photo-comparison": protectedUnit2Media("ultimate-b2.students-book.unit-2.speaking.photo-comparison"),
  "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha": protectedUnit2Media("ultimate-b2.students-book.unit-2.practice.tristan-da-cunha"),
};
