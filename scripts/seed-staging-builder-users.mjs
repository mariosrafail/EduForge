import { createSafePool } from "./_staging-db.mjs";
import { provisionBuilderUser } from "./_builder-user-provisioning.mjs";

const confirmation = "--confirm=seed-staging-builder-users";
if (!process.argv.includes(confirmation)) throw new Error(`Explicit confirmation is required: ${confirmation}`);
if (process.argv.some((value) => /^--password(?:=|$)/i.test(value))) {
  throw new Error("Passwords are never accepted as command arguments");
}

export const stagingBuilderUsers = Object.freeze(Array.from({ length: 5 }, (_, index) => ({
  email: `builder.dev${index + 1}@hhplms.invalid`,
  fullName: `Builder Developer ${index + 1}`,
  passwordEnvironmentName: `HHPLMS_STAGING_BUILDER_PASSWORD_${index + 1}`,
})));

const passwords = stagingBuilderUsers.map(({ passwordEnvironmentName }) => String(process.env[passwordEnvironmentName] || ""));
const missing = stagingBuilderUsers.filter((_, index) => !passwords[index]).map(({ passwordEnvironmentName }) => passwordEnvironmentName);
if (missing.length) throw new Error(`Required staging Builder password variables are missing: ${missing.join(", ")}`);
if (new Set(passwords).size !== passwords.length) throw new Error("Each staging Builder developer must have a unique password");

const { pool, safeLabel } = createSafePool("staging");
try {
  const rotate = process.argv.includes("--rotate");
  for (let index = 0; index < stagingBuilderUsers.length; index += 1) {
    const account = stagingBuilderUsers[index];
    const result = await provisionBuilderUser(pool, {
      email: account.email,
      fullName: account.fullName,
      password: passwords[index],
      rotate,
      source: "staging_seed_cli",
    });
    console.log(`${result.rotated ? "Rotated" : "Created"} ${result.email}.`);
  }
  console.log(`Staging Builder users prepared on ${safeLabel}; plaintext passwords were not printed.`);
} finally {
  await pool.end();
}
