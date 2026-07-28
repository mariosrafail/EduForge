import pg from "pg";
import { hashPassword, validatePassword } from "../netlify/functions/_account-lifecycle-utils.js";
import { emailPattern, normalizeEmail } from "../netlify/functions/_auth-utils.js";

const confirmation = "--confirm=create-platform-admin";
if (!process.argv.includes(confirmation)) throw new Error(`Explicit confirmation is required: ${confirmation}`);

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

const email = normalizeEmail(argument("email"));
const fullName = argument("name").trim();
const rotate = process.argv.includes("--rotate");
const password = String(process.env.PLATFORM_ADMIN_PASSWORD || "");
if (!emailPattern.test(email) || fullName.length < 2) throw new Error("--email and --name are required and must be valid");
if (!password) throw new Error("PLATFORM_ADMIN_PASSWORD is required; passwords are never accepted as command arguments");
const passwordError = validatePassword(password, email);
if (passwordError) throw new Error(passwordError);

const rawDatabaseUrl = process.env.DATABASE_URL || "";
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required");
const databaseUrl = new URL(rawDatabaseUrl);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
const loopback = ["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname);
if (loopback) {
  if (process.env.LOCAL_DATABASE_CONFIRMATION !== "isolated-local-pilot") {
    throw new Error("Loopback creation requires LOCAL_DATABASE_CONFIRMATION=isolated-local-pilot");
  }
} else {
  if (!["staging", "production"].includes(process.env.PLATFORM_ADMIN_ENVIRONMENT || "")) {
    throw new Error("PLATFORM_ADMIN_ENVIRONMENT must explicitly be staging or production");
  }
  if (process.env.PLATFORM_ADMIN_DATABASE_CONFIRMATION !== "confirmed-platform-admin-database") {
    throw new Error("PLATFORM_ADMIN_DATABASE_CONFIRMATION is required for a hosted target");
  }
}

const pool = new pg.Pool({ connectionString: rawDatabaseUrl });
try {
  const existing = (await pool.query("select id,status from platform_admins where lower(email)=lower($1)", [email])).rows[0];
  if (existing && !rotate) throw new Error("Platform Admin already exists; pass --rotate to deliberately replace its password");
  const passwordHash = await hashPassword(password);
  await pool.query("begin");
  try {
    let admin;
    if (existing) {
      admin = (await pool.query(`
        update platform_admins
        set full_name=$2,password_hash=$3,password_changed_at=now(),status='active'
        where id=$1 returning id,email
      `, [existing.id, fullName, passwordHash])).rows[0];
      await pool.query("select revoke_platform_admin_sessions($1)", [admin.id]);
      await pool.query(`
        insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,metadata)
        values($1,'password_rotated','platform_admin',$1::text,'{"sessions_revoked":true}'::jsonb)
      `, [admin.id]);
    } else {
      admin = (await pool.query(`
        insert into platform_admins(full_name,email,password_hash,status)
        values($1,$2,$3,'active') returning id,email
      `, [fullName, email, passwordHash])).rows[0];
      await pool.query(`
        insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,metadata)
        values($1,'platform_admin_created','platform_admin',$1::text,'{"source":"operator_cli"}'::jsonb)
      `, [admin.id]);
    }
    await pool.query("commit");
    console.log(`${existing ? "Rotated" : "Created"} Platform Admin ${admin.email}; plaintext password was not printed.`);
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
} finally {
  await pool.end();
}
