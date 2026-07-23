import unit2ReadingVideo from "../../assets/books/ultimate-b2/media/unit_2_reading_video.mp4";
import unit2ReadingAudio from "../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import unit2GrammarVideo from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/unit/2/part4/obj1.mp4";
import unit2FjordsAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3";
import unit2IcelandTripAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj4/audio.mp3";
import unit2PhotoComparisonAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part6/obj2/audio.mp3";
import unit2TristanDaCunhaAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2/part10/obj3/audio.mp3";
import unit1ReadingVideo from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/unit/1/part2/obj1.mp4";
import unit1ReadingAudio from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part2/obj2/audio.mp3";
import unit1ExtraVideo1 from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/extra/1/U1V1.mp4";
import unit1ExtraVideo2 from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/extra/1/U1V2.mp4";
import unit1ExtraVideo3 from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/extra/1/U1V3.mp4";
import unit1GrammarVideo from "../../../Ultimate English B2.app/Contents/Resources/assets/videos/book1/unit/1/part4/obj1.mp4";
import unit1TelevisionDialogue from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part5/obj3/audio.mp3";
import unit1SixSituations from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part5/obj4/audio.mp3";
import unit1DiscussionReview from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part5/obj5/audio.mp3";
import unit1StudentComparison from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part6/obj2/audio.mp3";
import unit1EightSituations from "../../../Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part10/obj1/audio.mp3";

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
