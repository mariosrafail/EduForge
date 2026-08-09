import path from "node:path";
import { ultimateB2TeacherAppAuthoring } from "../../src/data/ultimate-b2/teacherAppAuthoring.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function source(relativePath) {
  return path.resolve(repositoryRoot, relativePath);
}

const media = {
  "ultimate-b2.students-book.unit-1.reading.video-intro": ["video", "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/video/obj1.mp4"],
  "ultimate-b2.students-book.unit-1.reading.text-audio": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-text.mp3"],
  "ultimate-b2.students-book.unit-1.reading.extra-video-1": ["video", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-extra-1.mp4"],
  "ultimate-b2.students-book.unit-1.reading.extra-video-2": ["video", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-extra-2.mp4"],
  "ultimate-b2.students-book.unit-1.reading.extra-video-3": ["video", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-extra-3.mp4"],
  "ultimate-b2.students-book.unit-1.grammar.video-intro": ["video", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-grammar-intro.mp4"],
  "ultimate-b2.students-book.unit-1.listening.television-dialogue": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-television-dialogue.mp3"],
  "ultimate-b2.students-book.unit-1.listening.six-situations": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-six-situations.mp3"],
  "ultimate-b2.students-book.unit-1.listening.discussion-review": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-discussion-review.mp3"],
  "ultimate-b2.students-book.unit-1.speaking.student-comparison": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-student-comparison.mp3"],
  "ultimate-b2.students-book.unit-1.practice.eight-situations": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-1-eight-situations.mp3"],
  "ultimate-b2.students-book.unit-2.reading.video-intro": ["video", "src/assets/books/ultimate-b2/media/unit_2_reading_video.mp4"],
  "ultimate-b2.students-book.unit-2.reading.text-audio": ["audio", "src/assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3"],
  "ultimate-b2.students-book.unit-2.grammar.video-intro": ["video", "src/assets/books/ultimate-b2/teacher-offline-media/unit-2-grammar-intro.mp4"],
  "ultimate-b2.students-book.unit-2.listening.fjords": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-2-fjords.mp3"],
  "ultimate-b2.students-book.unit-2.listening.iceland-trip": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-2-iceland-trip.mp3"],
  "ultimate-b2.students-book.unit-2.speaking.photo-comparison": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-2-photo-comparison.mp3"],
  "ultimate-b2.students-book.unit-2.practice.tristan-da-cunha": ["audio", "src/assets/books/ultimate-b2/teacher-offline-media/unit-2-tristan-da-cunha.mp3"],
};

export function teacherPackAssetSources() {
  const assets = [{
    logicalKey: "ultimate-b2.students-book.cover",
    type: "cover",
    sourcePath: source("src/assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg"),
  }];

  for (const page of ultimateB2TeacherAppAuthoring.pages) {
    assets.push({
      pageId: page.id,
      logicalKey: page.logicalAssetIdentity,
      type: "page",
      sourcePath: source(page.image.repositoryPath),
    });
  }

  for (const [logicalKey, [type, relativePath]] of Object.entries(media)) {
    assets.push({ logicalKey, type, sourcePath: source(relativePath) });
  }

  return assets;
}
