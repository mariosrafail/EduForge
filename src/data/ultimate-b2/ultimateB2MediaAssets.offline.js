import readingVideo from "../../assets/books/ultimate-b2/media/unit_2_reading_video.mp4";
import readingAudio from "../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import readingText from "../../assets/books/ultimate-b2/student-text.jpg";
import workbookListeningAudio from "../../assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3";
import grammarRulesImage from "../../assets/books/ultimate-b2/grammar-rules.jpg";
import grammarIntroVideo from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-grammar-intro.mp4";
import fjordsAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-fjords.mp3";
import icelandTripAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-iceland-trip.mp3";
import photoComparisonAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-photo-comparison.mp3";
import tristanDaCunhaAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-tristan-da-cunha.mp3";
import unit1ReadingVideo from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/video/obj1.mp4";
import unit1ReadingAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-text.mp3";
import unit1ExtraVideo1 from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-extra-1.mp4";
import unit1ExtraVideo2 from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-extra-2.mp4";
import unit1ExtraVideo3 from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-extra-3.mp4";
import unit1GrammarVideo from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-grammar-intro.mp4";
import unit1TelevisionDialogue from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-television-dialogue.mp3";
import unit1SixSituations from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-six-situations.mp3";
import unit1DiscussionReview from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-discussion-review.mp3";
import unit1StudentComparison from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-student-comparison.mp3";
import unit1EightSituations from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-eight-situations.mp3";

export const ultimateB2ReadingVideo = { logicalKey: null, localUrl: readingVideo, devFallbackUrl: readingVideo };
export const ultimateB2ReadingAudio = { logicalKey: null, localUrl: readingAudio, devFallbackUrl: readingAudio };
export const ultimateB2ReadingTextImage = { logicalKey: null, localUrl: readingText, devFallbackUrl: readingText };
export const ultimateB2WorkbookListeningAudio = { logicalKey: null, localUrl: workbookListeningAudio, devFallbackUrl: workbookListeningAudio };
export const ultimateB2GrammarRulesImage = { logicalKey: null, localUrl: grammarRulesImage, devFallbackUrl: grammarRulesImage };

export const ultimateB2Unit2Media = {
  "ultimate-b2.students-book.unit-2.reading.video-intro": ultimateB2ReadingVideo,
  "ultimate-b2.students-book.unit-2.reading.text-audio": ultimateB2ReadingAudio,
  "ultimate-b2.students-book.unit-2.grammar.video-intro": { logicalKey: null, localUrl: grammarIntroVideo, devFallbackUrl: grammarIntroVideo },
  "ultimate-b2.students-book.unit-2.listening.fjords": { logicalKey: null, localUrl: fjordsAudio, devFallbackUrl: fjordsAudio },
  "ultimate-b2.students-book.unit-2.listening.iceland-trip": { logicalKey: null, localUrl: icelandTripAudio, devFallbackUrl: icelandTripAudio },
  "ultimate-b2.students-book.unit-2.speaking.photo-comparison": { logicalKey: null, localUrl: photoComparisonAudio, devFallbackUrl: photoComparisonAudio },
  "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha": { logicalKey: null, localUrl: tristanDaCunhaAudio, devFallbackUrl: tristanDaCunhaAudio },
};

export const ultimateB2Unit1Media = {
  "ultimate-b2.students-book.unit-1.reading.video-intro": { logicalKey: null, localUrl: unit1ReadingVideo, devFallbackUrl: unit1ReadingVideo },
  "ultimate-b2.students-book.unit-1.reading.text-audio": { logicalKey: null, localUrl: unit1ReadingAudio, devFallbackUrl: unit1ReadingAudio },
  "ultimate-b2.students-book.unit-1.reading.extra-video-1": { logicalKey: null, localUrl: unit1ExtraVideo1, devFallbackUrl: unit1ExtraVideo1 },
  "ultimate-b2.students-book.unit-1.reading.extra-video-2": { logicalKey: null, localUrl: unit1ExtraVideo2, devFallbackUrl: unit1ExtraVideo2 },
  "ultimate-b2.students-book.unit-1.reading.extra-video-3": { logicalKey: null, localUrl: unit1ExtraVideo3, devFallbackUrl: unit1ExtraVideo3 },
  "ultimate-b2.students-book.unit-1.grammar.video-intro": { logicalKey: null, localUrl: unit1GrammarVideo, devFallbackUrl: unit1GrammarVideo },
  "ultimate-b2.students-book.unit-1.listening.television-dialogue": { logicalKey: null, localUrl: unit1TelevisionDialogue, devFallbackUrl: unit1TelevisionDialogue },
  "ultimate-b2.students-book.unit-1.listening.six-situations": { logicalKey: null, localUrl: unit1SixSituations, devFallbackUrl: unit1SixSituations },
  "ultimate-b2.students-book.unit-1.listening.discussion-review": { logicalKey: null, localUrl: unit1DiscussionReview, devFallbackUrl: unit1DiscussionReview },
  "ultimate-b2.students-book.unit-1.speaking.student-comparison": { logicalKey: null, localUrl: unit1StudentComparison, devFallbackUrl: unit1StudentComparison },
  "ultimate-b2.students-book.unit-1.practice.eight-situations": { logicalKey: null, localUrl: unit1EightSituations, devFallbackUrl: unit1EightSituations },
};

export const ultimateB2StudentsBookMedia = { ...ultimateB2Unit1Media, ...ultimateB2Unit2Media };
