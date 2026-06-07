import { BookOpen, ClipboardList, Home, Star } from "lucide-react";

export const sectionIcons = {
  books: BookOpen,
  assignments: ClipboardList,
  grades: Star,
};

export const studentNavItems = [
  { id: "dashboard", label: "Dashboard", description: "Overview", icon: Home },
  { id: "books", label: "Books", description: "My digital books", icon: BookOpen },
  { id: "assignments", label: "Assignments", description: "Pending work", icon: ClipboardList },
  { id: "grades", label: "Grades", description: "Feedback", icon: Star },
];
