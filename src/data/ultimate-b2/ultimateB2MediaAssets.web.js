function remote(logicalKey, devFallbackUrl) {
  return { logicalKey, localUrl: null, devFallbackUrl: import.meta.env.DEV ? devFallbackUrl : null };
}
export const ultimateB2ReadingVideo = remote("ultimate-b2.students-book.unit-2.reading.video-intro", "/src/assets/books/ultimate-b2/media/unit_2_reading_video.mp4");
export const ultimateB2ReadingAudio = remote("ultimate-b2.students-book.unit-2.reading.text-audio", "/src/assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3");
export const ultimateB2ReadingTextImage = remote("ultimate-b2.students-book.unit-2.reading.text-image", "/src/assets/books/ultimate-b2/student-text.jpg");
export const ultimateB2WorkbookListeningAudio = { logicalKey: null, localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3" : null };
export const ultimateB2GrammarRulesImage = { logicalKey: null, localUrl: null, devFallbackUrl: import.meta.env.DEV ? "/src/assets/books/ultimate-b2/grammar-rules.jpg" : null };
