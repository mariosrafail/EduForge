import { hashPassword, validatePassword } from "../netlify/functions/_account-lifecycle-utils.js";
import { emailPattern, normalizeEmail } from "../netlify/functions/_auth-utils.js";

export async function provisionBuilderUser(pool, {
  email: rawEmail,
  fullName: rawFullName,
  password,
  rotate = false,
  source = "operator_cli",
}) {
  const email = normalizeEmail(rawEmail);
  const fullName = String(rawFullName || "").trim();
  if (!emailPattern.test(email) || fullName.length < 2 || fullName.length > 160) {
    throw new Error("Builder user email and full name must be valid");
  }
  if (!password) throw new Error("Builder user password must be supplied through the required environment variable");
  const passwordError = validatePassword(password, email);
  if (passwordError) throw new Error(passwordError);

  const existing = (await pool.query(
    "select id,status from builder_users where lower(email)=lower($1)",
    [email],
  )).rows[0];
  if (existing && !rotate) throw new Error("Builder user already exists; pass --rotate to deliberately replace its password");

  const passwordHash = await hashPassword(password);
  await pool.query("begin");
  try {
    let user;
    if (existing) {
      user = (await pool.query(`
        update builder_users
        set full_name=$2,password_hash=$3,password_changed_at=now(),status='active',role='developer'
        where id=$1 returning id,email
      `, [existing.id, fullName, passwordHash])).rows[0];
      await pool.query("select revoke_builder_sessions($1)", [user.id]);
      await pool.query(`
        insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
        values($1::uuid,'password_rotated','builder_user',$2::text,'{"sessions_revoked":true}'::jsonb)
      `, [user.id, user.id]);
    } else {
      user = (await pool.query(`
        insert into builder_users(full_name,email,password_hash,status,role)
        values($1,$2,$3,'active','developer') returning id,email
      `, [fullName, email, passwordHash])).rows[0];
      await pool.query(`
        insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
        values($1::uuid,'builder_user_created','builder_user',$2::text,jsonb_build_object('source',$3::text))
      `, [user.id, user.id, source]);
    }
    await pool.query("commit");
    return { id: user.id, email: user.email, rotated: Boolean(existing) };
  } catch (error) {
    await pool.query("rollback").catch(() => {});
    throw error;
  }
}
