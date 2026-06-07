import { motion } from "framer-motion";
import { ArrowLeft, BookOpen } from "lucide-react";
import studentTextImage from "../../../../assets/books/ultimate-b2/student-text.jpg";
import { BookImageFrame } from "../../shared/BookImageFrame.jsx";
import { Card } from "../../Shared.jsx";
import { ReadingAudioPlayer } from "./shared/ReadingAudioPlayer.jsx";

export function ReadingTextAudioScreen({ onBack, onStartExercise3, showBackButton = true }) {
  return (
    <motion.div
      className="reading-text-audio-screen"
      initial={{ opacity: 0, y: 18, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <Card className="reading-text-audio-card">
        <div className="book-page-spread-toolbar reading-text-audio-toolbar">
          {showBackButton && (
            <motion.button className="secondary-action compact-action" type="button" onClick={onBack} data-sound-click="back" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
              <ArrowLeft size={16} /> Back to page 20-21
            </motion.button>
          )}
          <div>
            <span className="eyebrow"><BookOpen size={15} /> Students Book / Unit 2</span>
            <h2>Reading text</h2>
          </div>
          <motion.button className="primary-action compact-action" type="button" onClick={onStartExercise3} data-sound-click="submit" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            Start Exercise 3
          </motion.button>
        </div>
        <ReadingAudioPlayer />
        <BookImageFrame
          title="On a fast track"
          subtitle="Read the full text while listening to the audio."
          imageSrc={studentTextImage}
          alt="Student's Book Unit 2 reading text"
          zoomTitle="Reading text"
          maxHeight="72vh"
          className="reading-text-audio-image"
        />
      </Card>
    </motion.div>
  );
}
