import { BookOpen, ClipboardList, Edit3, GraduationCap, Home, Users } from "lucide-react";
import { englishJourney6ComponentTitles } from "../../../data/englishJourney6DemoData.js";
import { ultimateB2ComponentTitles } from "../../../data/ultimateB2DemoData.js";

export const teacherSections = [
  {
    id: "books",
    title: "Books",
    icon: BookOpen,
    description: "Browse activated Ultimate B2 books and assign exercises.",
    metric: "4 active components",
  },
  {
    id: "classes",
    title: "Classes",
    icon: GraduationCap,
    description: "Manage B2 class groups and view class progress.",
    metric: "3 B2 classes",
  },
  {
    id: "students",
    title: "Students",
    icon: Users,
    description: "Review student progress, answers, and results.",
    metric: "55 demo students",
  },
  {
    id: "assignments",
    title: "Assignments",
    icon: ClipboardList,
    description: "Track assigned book exercises and completion.",
    metric: "4 active assignments",
  },
  {
    id: "custom-assignment",
    title: "Custom Assignment",
    icon: Edit3,
    description: "Create or edit custom interactive activities.",
    metric: "Editor available",
  },
];

export const teacherNavItems = [
  { id: "dashboard", label: "Dashboard", description: "Overview", icon: Home },
  { id: "books", label: "Books", description: "Digital book access", icon: BookOpen },
  { id: "classes", label: "Classes", description: "B2 groups", icon: GraduationCap },
  { id: "students", label: "Students", description: "Results", icon: Users },
  { id: "assignments", label: "Assignments", description: "Assigned exercises", icon: ClipboardList },
  { id: "custom-assignment", label: "Custom Assignment", description: "Activity editor", icon: Edit3 },
];

export const classLevelOptions = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const classBookOptions = Array.from(new Set(["Ultimate B2", ...ultimateB2ComponentTitles, "English Journey 6", ...englishJourney6ComponentTitles]));
