import readingVideo from "../../assets/books/ultimate-b2/media/unit_2_reading_video.mp4";
import readingAudio from "../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import readingText from "../../assets/books/ultimate-b2/student-text.jpg";
import workbookListeningAudio from "../../assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3";
import grammarRulesImage from "../../assets/books/ultimate-b2/grammar-rules.jpg";
import grammarIntroVideo from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/unit/2/part4/obj1.mp4";
import fjordsAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3";
import icelandTripAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj4/audio.mp3";
import photoComparisonAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part6/obj2/audio.mp3";
import tristanDaCunhaAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part10/obj3/audio.mp3";

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
