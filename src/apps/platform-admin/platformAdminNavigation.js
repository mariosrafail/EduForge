import {
  BookOpenCheck,
  Building2,
  ClipboardList,
  LayoutDashboard,
  School,
  UsersRound,
} from "lucide-react";

export const platformSections = [
  { id: "overview", label: "Overview", description: "Platform health and activity", icon: LayoutDashboard },
  { id: "schools", label: "Schools", description: "Tenant setup and status", icon: Building2 },
  { id: "users", label: "Users", description: "Accounts and sessions", icon: UsersRound },
  { id: "classes", label: "Classes", description: "Read-only class directory", icon: School },
  { id: "access", label: "Book access", description: "Phase 1 entitlements", icon: BookOpenCheck },
  { id: "audit", label: "Audit log", description: "Privileged activity history", icon: ClipboardList },
];

export const SECTION_KEYS = platformSections.map((item) => item.id);

export function getInitialPlatformSection() {
  const segment = location.pathname.replace(/^\/platform-admin\/?/, "").split("/")[0];
  return SECTION_KEYS.includes(segment) ? segment : "overview";
}
