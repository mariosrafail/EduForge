import unit2ReadingAudio from "../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import unit2ReadingText from "../../assets/books/ultimate-b2/student-text.jpg";
import unit2WorkbookListeningAudio from "../../assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3";
import unit2GrammarRulesImage from "../../assets/books/ultimate-b2/grammar-rules.jpg";
import unit2FjordsAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-fjords.mp3";
import unit2IcelandTripAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-iceland-trip.mp3";
import unit2PhotoComparisonAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-photo-comparison.mp3";
import unit2TristanDaCunhaAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-tristan-da-cunha.mp3";
import unit1ReadingAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-text.mp3";
import unit1TelevisionDialogue from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-television-dialogue.mp3";
import unit1SixSituations from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-six-situations.mp3";
import unit1DiscussionReview from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-discussion-review.mp3";
import unit1StudentComparison from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-student-comparison.mp3";
import unit1EightSituations from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-eight-situations.mp3";

function localAsset(localUrl) {
  return { logicalKey: null, localUrl, devFallbackUrl: localUrl };
}

const playerMedia = (path) => localAsset(`/player-media/ultimate-b2/${path}`);

export const ultimateB2Unit1Media = {
  "ultimate-b2.students-book.unit-1.reading.video-intro": playerMedia("unit-1-reading-video-intro.mp4"),
  "ultimate-b2.students-book.unit-1.reading.text-audio": localAsset(unit1ReadingAudio),
  "ultimate-b2.students-book.unit-1.reading.extra-video-1": playerMedia("unit-1-reading-extra-video-1.mp4"),
  "ultimate-b2.students-book.unit-1.reading.extra-video-2": playerMedia("unit-1-reading-extra-video-2.mp4"),
  "ultimate-b2.students-book.unit-1.reading.extra-video-3": playerMedia("unit-1-reading-extra-video-3.mp4"),
  "ultimate-b2.students-book.unit-1.grammar.video-intro": playerMedia("unit-1-grammar-video-intro.mp4"),
  "ultimate-b2.students-book.unit-1.listening.television-dialogue": localAsset(unit1TelevisionDialogue),
  "ultimate-b2.students-book.unit-1.listening.six-situations": localAsset(unit1SixSituations),
  "ultimate-b2.students-book.unit-1.listening.discussion-review": localAsset(unit1DiscussionReview),
  "ultimate-b2.students-book.unit-1.speaking.student-comparison": localAsset(unit1StudentComparison),
  "ultimate-b2.students-book.unit-1.practice.eight-situations": localAsset(unit1EightSituations),
};

export const ultimateB2ReadingVideo = playerMedia("unit-2-reading-video-intro.mp4");
export const ultimateB2ReadingAudio = localAsset(unit2ReadingAudio);
export const ultimateB2ReadingTextImage = localAsset(unit2ReadingText);
export const ultimateB2WorkbookListeningAudio = localAsset(unit2WorkbookListeningAudio);
export const ultimateB2GrammarRulesImage = localAsset(unit2GrammarRulesImage);

export const ultimateB2Unit2Media = {
  "ultimate-b2.students-book.unit-2.reading.video-intro": ultimateB2ReadingVideo,
  "ultimate-b2.students-book.unit-2.reading.text-audio": ultimateB2ReadingAudio,
  "ultimate-b2.students-book.unit-2.grammar.video-intro": playerMedia("unit-2-grammar-video-intro.mp4"),
  "ultimate-b2.students-book.unit-2.listening.fjords": localAsset(unit2FjordsAudio),
  "ultimate-b2.students-book.unit-2.listening.iceland-trip": localAsset(unit2IcelandTripAudio),
  "ultimate-b2.students-book.unit-2.speaking.photo-comparison": localAsset(unit2PhotoComparisonAudio),
  "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha": localAsset(unit2TristanDaCunhaAudio),
};

export const ultimateB2StudentsBookMedia = {
  ...ultimateB2Unit1Media,
  ...ultimateB2Unit2Media,
};
