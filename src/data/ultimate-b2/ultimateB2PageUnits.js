import page19Image from "../../../selides/19.png";
import page20To21Image from "../../../selides/20-21.png";
import page22To23Image from "../../../selides/22-23.png";
import page24To25Image from "../../../selides/24-25.png";
import page26Image from "../../../selides/26.png";
import page27Image from "../../../selides/27.png";
import page28To29Image from "../../../selides/28-29.png";
import page30Image from "../../../selides/30.png";
import page31Image from "../../../selides/31.png";
import page32Image from "../../../selides/32.png";
import page33Image from "../../../selides/33.png";
import page34Image from "../../../selides/34.png";

export const ultimateB2StudentsBookPageUnits = [
  {
    id: "ub2-sb-unit-2-pages",
    title: "Unit 2",
    unit: "Unit 2",
    pages: [
      { id: "reading-19", title: "Reading", label: "pg 19", pageNumber: 19, images: [page19Image] },
      {
        id: "reading-20-21",
        title: "Reading",
        label: "pg 20-21",
        pageNumber: 20,
        images: [page20To21Image],
        continuesToVideo: true,
        actions: [
          { id: "video", label: "Video", top: "7%", left: "3.2%", width: "45%", height: "14%", ariaLabel: "Open video activity from page 20", target: "video" },
          { id: "text-audio", label: "Text + Audio", top: "22%", left: "3.4%", width: "46.2%", height: "66%", ariaLabel: "Open reading text with audio from page 20", target: "text-audio" },
          { id: "exercise-3", label: "Exercise 3", top: "8%", left: "53.2%", width: "43.5%", height: "38%", ariaLabel: "Open Exercise 3 missing sentences", target: "exercise-3", activityKey: "reading-ex3" },
          { id: "exercise-4", label: "Exercise 4", top: "48%", left: "53.3%", width: "43.4%", height: "29%", ariaLabel: "Open Exercise 4 circle the correct words", target: "exercise-4", activityKey: "reading-ex4" },
        ],
      },
      { id: "vocabulary-22-23", title: "Vocabulary in Use", label: "pg 22-23", pageNumber: 22, images: [page22To23Image] },
      { id: "grammar-24-25", title: "Grammar in Use", label: "pg 24-25", pageNumber: 24, images: [page24To25Image] },
      { id: "listening-26", title: "Listening", label: "pg 26", pageNumber: 26, images: [page26Image] },
      { id: "speaking-27", title: "Speaking", label: "pg 27", pageNumber: 27, images: [page27Image] },
      { id: "writing-28-29", title: "Writing", label: "pg 28-29", pageNumber: 28, images: [page28To29Image] },
      { id: "review-30", title: "Review 2", label: "pg 30", pageNumber: 30, images: [page30Image] },
      { id: "practice-31-32", title: "Practice 2", label: "pg 31-32", pageNumber: 31, images: [page31Image, page32Image] },
      { id: "progress-check-33-34", title: "Progress check 1", label: "pg 33-34", pageNumber: 33, images: [page33Image, page34Image] },
    ],
  },
];

