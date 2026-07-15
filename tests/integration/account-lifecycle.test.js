import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import pg from "pg";
import { setSqlForTests, hashToken, sessionCookieName } from "../../netlify/functions/_auth-utils.js";
import { clearCapturedEmailsForTests, getCapturedEmailsForTests } from "../../netlify/functions/_email-utils.js";
import { handler as invite } from "../../netlify/functions/account-invite.js";
import { handler as tokenCheck } from "../../netlify/functions/account-token-check.js";
import { handler as setPassword } from "../../netlify/functions/account-set-password.js";
import { handler as forgot } from "../../netlify/functions/auth-forgot-password.js";
import { handler as reset } from "../../netlify/functions/auth-reset-password.js";
import { handler as changePassword } from "../../netlify/functions/auth-change-password.js";
import { handler as revokeSessions } from "../../netlify/functions/auth-revoke-sessions.js";

const { Pool }=pg;
const url=process.env.TEST_DATABASE_URL||"";
const enabled=Boolean(url)&&process.env.TEST_DATABASE_CONFIRMATION==="isolated-test-database";
function tag(pool){return async(strings,...values)=>{let text=strings[0];for(let i=0;i<values.length;i++)text+=`$${i+1}${strings[i+1]}`;return (await pool.query(text,values)).rows;};}
function scoped(base,schema){const u=new URL(base);u.searchParams.set("options",`-c search_path=${schema}`);return u.toString();}
function parse(r){return {status:r.statusCode,body:JSON.parse(r.body||"{}"),headers:r.headers||{}};}
async function call(handler,{body={},cookie="",ip="127.0.9.1"}={}){return parse(await handler({httpMethod:"POST",headers:{host:"localhost:8888",cookie,"x-nf-client-connection-ip":ip},body:JSON.stringify(body),queryStringParameters:{}}));}
async function session(pool,id){const token=randomBytes(24).toString("hex");await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')",[id,hashToken(token)]);return `${sessionCookieName}=${token}`;}

test("account lifecycle handlers use single-use links, tenant admin scope and session rotation",{skip:!enabled,timeout:120000},async(t)=>{
  const schema=`lifecycle_${randomBytes(6).toString("hex")}`;const adminPool=new Pool({connectionString:url});await adminPool.query(`create schema "${schema}"`);const pool=new Pool({connectionString:scoped(url,schema)});
  const previous={db:process.env.DATABASE_URL,public:process.env.APP_PUBLIC_URL,mode:process.env.ACCOUNT_EMAIL_MODE};
  process.env.DATABASE_URL=scoped(url,schema);process.env.APP_PUBLIC_URL="http://localhost:8888";process.env.ACCOUNT_EMAIL_MODE="capture";setSqlForTests(tag(pool));clearCapturedEmailsForTests();
  t.after(async()=>{setSqlForTests(null);for(const [key,value] of Object.entries({DATABASE_URL:previous.db,APP_PUBLIC_URL:previous.public,ACCOUNT_EMAIL_MODE:previous.mode})){if(value===undefined)delete process.env[key];else process.env[key]=value;}await pool.end();await adminPool.query(`drop schema if exists "${schema}" cascade`);await adminPool.end();});
  const files=(await readdir("database")).filter(n=>/^\d+.*\.sql$/.test(n)&&n!=="012_demo_login_passwords.sql").sort((a,b)=>a.localeCompare(b));for(const file of files)await pool.query(await readFile(`database/${file}`,"utf8"));
  const schools=(await pool.query("insert into schools(name) values('Lifecycle A'),('Lifecycle B') returning id,name")).rows;const a=schools[0].id,b=schools[1].id;const pass=await bcrypt.hash("Admin-Original-2026",4);
  const admins=(await pool.query("insert into app_users(school_id,full_name,email,role,status,password_hash) values($1,'Admin A','admin-a@life.test','admin','active',$3),($2,'Admin B','admin-b@life.test','admin','active',$3) returning id,school_id",[a,b,pass])).rows;
  let cookie=await session(pool,admins[0].id);const cookieB=await session(pool,admins[1].id);
  const invited=await call(invite,{cookie,body:{full_name:"Teacher New",email:"teacher-new@life.test",role:"teacher",school_id:b}});assert.equal(invited.status,400);
  assert.equal((await call(invite,{cookie,body:{full_name:"Admin Escalation",email:"admin-new@life.test",role:"admin"}})).status,400);
  const created=await call(invite,{cookie,body:{full_name:"Teacher New",email:"teacher-new@life.test",role:"teacher"}});assert.equal(created.status,201);assert.equal(created.body.user.school_id,undefined);
  const captured=getCapturedEmailsForTests();assert.equal(captured.length,1);const token=new URL(captured[0].actionUrl).hash.split("token=")[1];assert.ok(token);
  assert.equal((await call(tokenCheck,{body:{token,purpose:"initial_password"}})).status,200);
  const resent=await call(invite,{cookie,body:{email:"teacher-new@life.test",resend:true},ip:"127.0.9.8"});assert.equal(resent.status,200);
  const replacement=new URL(getCapturedEmailsForTests().at(-1).actionUrl).hash.split("token=")[1];assert.equal((await call(tokenCheck,{body:{token,purpose:"initial_password"}})).status,400);
  const accepted=await call(setPassword,{body:{token:replacement,password:"Teacher-Strong-2026"}});assert.equal(accepted.status,200);assert.equal(accepted.body.user.status,"active");assert.equal((await call(setPassword,{body:{token:replacement,password:"Another-Strong-2026"}})).status,400);
  assert.equal((await call(invite,{cookie,body:{email:"teacher-new@life.test",resend:true},ip:"127.0.9.9"})).status,404);
  const unknown=await call(forgot,{body:{email:"missing@life.test"},ip:"127.0.9.2"});const known=await call(forgot,{body:{email:"teacher-new@life.test"},ip:"127.0.9.3"});assert.equal(unknown.status,200);assert.equal(known.status,200);assert.equal(unknown.body.message,known.body.message);
  const resetMail=getCapturedEmailsForTests().at(-1);const resetToken=new URL(resetMail.actionUrl).hash.split("token=")[1];const resetResult=await call(reset,{body:{token:resetToken,password:"Teacher-Reset-2026"},ip:"127.0.9.4"});assert.equal(resetResult.status,200);assert.equal((await call(reset,{body:{token:resetToken,password:"Teacher-Replay-2026"},ip:"127.0.9.4"})).status,400);
  const changed=await call(changePassword,{cookie:resetResult.headers["Set-Cookie"].split(";")[0],body:{currentPassword:"Teacher-Reset-2026",newPassword:"Teacher-Changed-2026"}});assert.equal(changed.status,200);
  assert.equal((await call(revokeSessions,{cookie:cookieB,body:{userId:created.body.user.id}})).status,404);
  const self=await call(revokeSessions,{cookie,body:{}});assert.equal(self.status,200);assert.ok(self.headers["Set-Cookie"]);
  for(let i=0;i<5;i++)assert.equal((await call(forgot,{body:{email:"rate-limit@life.test"},ip:"127.0.9.20"})).status,200);
  assert.equal((await call(forgot,{body:{email:"rate-limit@life.test"},ip:"127.0.9.20"})).status,429);
  const rawSearch=await pool.query("select token_hash,metadata from account_tokens");assert.equal(JSON.stringify(rawSearch.rows).includes(token),false);assert.equal((await pool.query("select count(*)::int count from account_email_outbox where template_variables ? 'token'")).rows[0].count,0);
});
