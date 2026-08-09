import unit2ReadingVideo from "../../assets/books/ultimate-b2/media/unit_2_reading_video.mp4";
import unit2ReadingAudio from "../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import unit2GrammarVideo from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-grammar-intro.mp4";
import unit2FjordsAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-fjords.mp3";
import unit2IcelandTripAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-iceland-trip.mp3";
import unit2PhotoComparisonAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-photo-comparison.mp3";
import unit2TristanDaCunhaAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-2-tristan-da-cunha.mp3";
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

function localAsset(localUrl) {
  return { logicalKey: null, localUrl, devFallbackUrl: localUrl };
}

export const ultimateB2Unit1Media = {
  "ultimate-b2.students-book.unit-1.reading.video-intro": localAsset(unit1ReadingVideo),
  "ultimate-b2.students-book.unit-1.reading.text-audio": localAsset(unit1ReadingAudio),
  "ultimate-b2.students-book.unit-1.reading.extra-video-1": localAsset(unit1ExtraVideo1),
  "ultimate-b2.students-book.unit-1.reading.extra-video-2": localAsset(unit1ExtraVideo2),
  "ultimate-b2.students-book.unit-1.reading.extra-video-3": localAsset(unit1ExtraVideo3),
  "ultimate-b2.students-book.unit-1.grammar.video-intro": localAsset(unit1GrammarVideo),
  "ultimate-b2.students-book.unit-1.listening.television-dialogue": localAsset(unit1TelevisionDialogue),
  "ultimate-b2.students-book.unit-1.listening.six-situations": localAsset(unit1SixSituations),
  "ultimate-b2.students-book.unit-1.listening.discussion-review": localAsset(unit1DiscussionReview),
  "ultimate-b2.students-book.unit-1.speaking.student-comparison": localAsset(unit1StudentComparison),
  "ultimate-b2.students-book.unit-1.practice.eight-situations": localAsset(unit1EightSituations),
};

export const ultimateB2Unit2Media = {
  "ultimate-b2.students-book.unit-2.reading.video-intro": localAsset(unit2ReadingVideo),
  "ultimate-b2.students-book.unit-2.reading.text-audio": localAsset(unit2ReadingAudio),
  "ultimate-b2.students-book.unit-2.grammar.video-intro": localAsset(unit2GrammarVideo),
  "ultimate-b2.students-book.unit-2.listening.fjords": localAsset(unit2FjordsAudio),
  "ultimate-b2.students-book.unit-2.listening.iceland-trip": localAsset(unit2IcelandTripAudio),
  "ultimate-b2.students-book.unit-2.speaking.photo-comparison": localAsset(unit2PhotoComparisonAudio),
  "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha": localAsset(unit2TristanDaCunhaAudio),
};

export const ultimateB2StudentsBookMedia = {
  ...ultimateB2Unit1Media,
  ...ultimateB2Unit2Media,
};
