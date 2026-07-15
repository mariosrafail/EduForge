import { getSql, isValidUuid, json, requireAuth, safeServerError } from "./_auth-utils.js";
import { parseJsonBody, prepareFreshSession, requestFingerprint } from "./_account-lifecycle-utils.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const sql=getSql(); const auth=await requireAuth(event,sql); if(auth.error)return auth.error;
    const parsed=parseJsonBody(event); if(parsed.error)return json(400,{error:parsed.error});
    const targetId=String(parsed.value.userId||auth.currentUser.id); const self=targetId===auth.currentUser.id;
    if(!isValidUuid(targetId))return json(400,{error:"A valid user ID is required"});
    if(!self&&auth.currentUser.role!=="admin")return json(403,{error:"Forbidden"});
    const targets=await sql`select id,school_id,role from app_users where id=${targetId} and (${self} or school_id=${auth.currentUser.school_id}) limit 1`;
    if(!targets[0])return json(404,{error:"User not found"});
    const session=self?prepareFreshSession(event):null;
    if(self){
      await sql`with removed as (delete from auth_sessions where user_id=${targetId}), fresh as (insert into auth_sessions(user_id,token_hash,expires_at) values(${targetId},${session.tokenHash},${session.expiresAt})) insert into account_security_events(user_id,actor_user_id,school_id,event_type,request_fingerprint) values(${targetId},${auth.currentUser.id},${targets[0].school_id},'sessions_revoked',${requestFingerprint(event)})`;
    }else{
      await sql`with removed as (delete from auth_sessions where user_id=${targetId}) insert into account_security_events(user_id,actor_user_id,school_id,event_type,request_fingerprint) values(${targetId},${auth.currentUser.id},${targets[0].school_id},'sessions_revoked_by_admin',${requestFingerprint(event)})`;
    }
    return json(200,{message:"Sessions revoked"},session?{"Set-Cookie":session.cookie}:{});
  }catch(error){return safeServerError(error,"Session revocation failed");}
}
