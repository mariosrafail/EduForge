import { json } from "./shared.js";

export function evaluateClassTargetPackageCompatibility(classRows = [], targetPackageIds = []) {
  const classWithoutPackage = classRows.find((row) => !row.book_package_id);
  if (classWithoutPackage) {
    return {
      conflict: "class-package-unassigned",
      error: "A selected class is not linked to a book package. Link the class before assigning new work.",
    };
  }
  const classPackages = new Set(classRows.map((row) => String(row.book_package_id)));
  if (classPackages.size !== 1) {
    return {
      conflict: "mixed-class-packages",
      error: "Selected classes belong to different book packages. Choose classes from one package.",
    };
  }
  const targetPackages = new Set(targetPackageIds.filter(Boolean).map(String));
  if (targetPackageIds.some((packageId) => !packageId) || targetPackages.size !== 1) {
    return {
      conflict: "class-package-mismatch",
      error: "Selected activities must all belong to the selected classes’ book package.",
    };
  }
  if ([...targetPackages][0] !== [...classPackages][0]) {
    return {
      conflict: "class-package-mismatch",
      error: "An activity belongs to a different book package than the selected classes.",
    };
  }
  return null;
}

export function classTargetPackageConflictResponse(classRows, targetPackageIds) {
  const conflict = evaluateClassTargetPackageCompatibility(classRows, targetPackageIds);
  return conflict ? json(409, conflict) : null;
}

export async function verifyDirectStudentTargetEntitlements(sql, studentIds, packageId, schoolId) {
  if (!studentIds.length) return null;
  const rows = await sql`
    select distinct student.id
    from app_users student
    join book_access access
      on access.user_id = student.id
     and access.book_package_id = ${packageId}
     and access.role_scope = 'student'
    join book_packages package
      on package.id = access.book_package_id
     and package.status = 'active'
    where student.id = any(${studentIds}::uuid[])
      and student.school_id = ${schoolId}
      and student.role = 'student'
      and student.status = 'active'
  `;
  return rows.length === new Set(studentIds.map(String)).size
    ? null
    : json(403, { error: "Every directly assigned student must be entitled to the activity’s book package." });
}
