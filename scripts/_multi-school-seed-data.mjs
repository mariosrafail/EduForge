export const MULTI_SCHOOL_SEED_KEY = "eduforge-fictional-multi-school-v1";
export const MULTI_SCHOOL_CONFIRMATION = "fictional-multi-school-development-data";
export const MULTI_SCHOOL_EMAIL_DOMAIN = "multi-school.dev.invalid";
export const MULTI_SCHOOL_DEMO_PASSWORD = "EduForge-Dev-Only-2026!";

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
  const classes = [0, 1, 2].map((index) => ({
    id: uuid(0x20, school, index + 1),
    name: `${name} B2-${index + 1}`,
    slug: `dev-${key}-b2-${index + 1}`,
    invite: `DEV${school}${index + 1}B2AA`,
    teacherId: users[index === 2 ? 2 : 1].id,
    studentIds: users.filter((user) => user.role === "student").filter((_, studentIndex) => studentIndex % 3 === index).map((user) => user.id),
  }));
  return {
    key, name, id: uuid(0x01, school, 1), users, classes,
    batchId: uuid(0x30, school, 1), requestKey: uuid(0x31, school, 1),
    codes: ["unused", "redeemed", "expired", "revoked"].map((status, index) => ({
      id: uuid(0x40, school, index + 1), status,
      value: `DEV-${key.toUpperCase()}-B2-${status.toUpperCase()}-2026`,
      redeemedBy: status === "redeemed" ? users.find((user) => user.profile === "redeemed").id : null,
    })),
    assignments: classes.map((classItem, index) => ({ id: uuid(0x50, school, index + 1), classId: classItem.id, teacherId: classItem.teacherId, dueDays: 3 + index })),
  };
});

export function multiSchoolRegistryEntries() {
  return MULTI_SCHOOL.map((school) => ["school", school.id]);
}
