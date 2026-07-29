import { BarChart3, BookOpen, Building2, CheckCircle2, Link2, Users } from "lucide-react";

export const adminNavItems = [
  { id: "overview", route: "admin", label: "Overview", description: "Metrics and rollout checklist", icon: CheckCircle2 },
  { id: "school-setup", route: "admin-school-setup", label: "School setup", description: "School profile and identity", icon: Building2 },
  { id: "users", route: "admin-users", label: "Users", description: "Invite and manage users", icon: Users },
  { id: "books-classes", route: "admin-books-classes", label: "Books & classes", description: "Classes and activation", icon: BookOpen },
  { id: "publisher-intelligence", route: "admin-publisher-intelligence", label: "Publisher intelligence", description: "Adoption and exports", icon: BarChart3 },
  { id: "integrations", route: "admin-integrations", label: "Integrations", description: "Connected systems", icon: Link2 },
];

export function adminRouteForSection(sectionId) {
  return adminNavItems.find((item) => item.id === sectionId)?.route || "admin";
}
