export const MULTI_SCHOOL_SEED_KEY = "eduforge-fictional-multi-school-v1";
export const MULTI_SCHOOL_CONFIRMATION = "fictional-multi-school-development-data";
export const MULTI_SCHOOL_EMAIL_DOMAIN = "multi-school.dev.invalid";
export const MULTI_SCHOOL_DEMO_PASSWORD = "EduForge-Dev-Only-2026!";
export const MULTI_SCHOOL_PLATFORM_ADMIN = Object.freeze({
  id: "d1700000-00f0-4000-8000-000000000001",
  fullName: "LMS Platform Demo Operator",
  email: "platform.admin@multi-school.dev.invalid",
});
export const MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD = "EduForge-Platform-Dev-Only-2026!";

function uuid(type, school, item = 0) {
  return `d1700000-${type.toString(16).padStart(4, "0")}-4000-8000-${(school * 100 + item).toString(16).padStart(12, "0")}`;
}

const definitions = [
  ["athens", "Athens Language Academy"],
  ["piraeus", "Piraeus English Centre"],
  ["thessaloniki", "Thessaloniki Learning Hub"],
];

const studentProfiles = [
  ["Alex Strong", "strong"], ["Niki Support", "weak"], ["Chris Missing", "missing"],
  ["Dana Active", "redeemed"], ["Eleni Practice", "standard"], ["George Progress", "standard"],
  ["Iris Reading", "standard"], ["Kostas Writing", "expired-code"],
];

const assignmentProfiles = [
  { kind: "auto", seedsSubmissions: true },
  { kind: "review", seedsSubmissions: true },
  { kind: "expired", seedsSubmissions: true },
  { kind: "future", seedsSubmissions: false },
];

export const MULTI_SCHOOL = definitions.map(([key, name], schoolOffset) => {
  const school = schoolOffset + 1;
  const users = [
    { id: uuid(0x10, school, 1), role: "admin", name: `${name} Admin`, email: `admin.${key}@${MULTI_SCHOOL_EMAIL_DOMAIN}` },
    { id: uuid(0x10, school, 2), role: "teacher", name: `${name} Teacher One`, email: `teacher1.${key}@${MULTI_SCHOOL_EMAIL_DOMAIN}` },
    { id: uuid(0x10, school, 3), role: "teacher", name: `${name} Teacher Two`, email: `teacher2.${key}@${MULTI_SCHOOL_EMAIL_DOMAIN}` },
    ...studentProfiles.map(([studentName, profile], index) => ({
      id: uuid(0x10, school, 10 + index), role: "student", name: `${studentName} ${school}`,
      email: `student${index + 1}.${key}@${MULTI_SCHOOL_EMAIL_DOMAIN}`, profile,
    })),
  ];
  const students = users.filter((user) => user.role === "student");
  const classMembers = [students.slice(0, 4), students.slice(4, 6), students.slice(6, 8)];
  const classes = [0, 1, 2].map((index) => ({
    id: uuid(0x20, school, index + 1),
    name: `${name} B2-${index + 1}`,
    slug: `dev-${key}-b2-${index + 1}`,
    invite: `DEV${school}${index + 1}B2AA`,
    teacherId: users[index === 2 ? 2 : 1].id,
    studentIds: classMembers[index].map((user) => user.id),
  }));
  return {
    key, name, id: uuid(0x01, school, 1), users, classes,
    branding: { logo: "DEV", primary: "#1e3a8a", secondary: "#0f172a" },
    batchId: uuid(0x30, school, 1), requestKey: uuid(0x31, school, 1),
    codes: ["unused", "redeemed", "expired", "revoked"].map((status, index) => ({
      id: uuid(0x40, school, index + 1), status,
      value: `DEV-${key.toUpperCase()}-B2-${status.toUpperCase()}-2026`,
      redeemedBy: status === "redeemed" ? users.find((user) => user.profile === "redeemed").id : null,
    })),
    assignments: assignmentProfiles.map((profile, index) => ({
      ...profile,
      id: uuid(0x50, school, index + 1),
    })),
  };
});

export function multiSchoolSeedSubmissionId(schoolIndex, scenarioIndex, memberIndex) {
  const item = schoolIndex * 10000 + scenarioIndex * 100 + memberIndex + 1;
  return `d1700000-0060-4000-8000-${item.toString(16).padStart(12, "0")}`;
}

export function multiSchoolSeedSubmissionIds() {
  return MULTI_SCHOOL.flatMap((school, schoolIndex) => school.assignments.flatMap((assignment, scenarioIndex) => {
    if (!assignment.seedsSubmissions) return [];
    return school.classes[0].studentIds.flatMap((studentId, memberIndex) => {
      const student = school.users.find((user) => user.id === studentId);
      return student.profile === "missing"
        ? []
        : [multiSchoolSeedSubmissionId(schoolIndex, scenarioIndex, memberIndex)];
    });
  }));
}

export function multiSchoolRegistryEntries() {
  return [
    ...MULTI_SCHOOL.map((school) => ["school", school.id]),
    ["platform_admin", MULTI_SCHOOL_PLATFORM_ADMIN.id],
  ];
}
