import { BookOpen, ClipboardList, Edit3, GraduationCap, Home, Users } from "lucide-react";
import { englishJourney6ComponentTitles } from "../../../data/englishJourney6DemoData.js";
import { ultimateB2ComponentTitles } from "../../../data/ultimateB2DemoData.js";

export const teacherSections = [
  {
    id: "books",
    title: "Books",
    icon: BookOpen,
    description: "Browse activated digital books and assign exercises.",
  },
  {
    id: "classes",
    title: "Classes",
    icon: GraduationCap,
    description: "Manage class groups and view class progress.",
  },
  {
    id: "students",
    title: "Students",
    icon: Users,
    description: "Review student progress, answers, and results.",
  },
  {
    id: "assignments",
    title: "Assignments",
    icon: ClipboardList,
    description: "Track assigned book exercises and completion.",
  },
  {
    id: "custom-assignment",
    title: "Custom Assignment",
    icon: Edit3,
    description: "Create or edit custom interactive activities.",
    capabilityLabel: "Editor available",
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
