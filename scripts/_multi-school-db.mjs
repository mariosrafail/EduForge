import pg from "pg";
import { createSafePool } from "./_staging-db.mjs";
import { LOCAL_MULTI_SCHOOL, requireLocalMultiSchoolTarget } from "./_local-multi-school.mjs";

export function createMultiSchoolPool() {
  if (process.env.MULTI_SCHOOL_LOCAL_CONFIRMATION) {
    if (process.env.MULTI_SCHOOL_LOCAL_CONFIRMATION !== LOCAL_MULTI_SCHOOL.confirmation) {
      throw new Error("MULTI_SCHOOL_LOCAL_CONFIRMATION is invalid");
    }
    const target = requireLocalMultiSchoolTarget(process.env, [`--confirm=${LOCAL_MULTI_SCHOOL.confirmation}`]);
    return { ...target, pool: new pg.Pool({ connectionString: target.connectionString }) };
  }
  return createSafePool("staging");
}
