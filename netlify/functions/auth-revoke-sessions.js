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
    const targets=await sql`select id,school_id,role,status from app_users where id=${targetId} and (${self} or school_id=${auth.currentUser.school_id}) limit 1`;
    if(!targets[0])return json(404,{error:"User not found"});
    if(!self&&(!["teacher","student"].includes(targets[0].role)||targets[0].status!=="active"))return json(403,{error:"Only active same-school teachers or students may be force-revoked"});
    const session=self?prepareFreshSession(event):null;
    if(self){
      await sql`with removed as (select revoke_account_sessions(${targetId}) as count), fresh as (insert into auth_sessions(user_id,token_hash,expires_at) select ${targetId},${session.tokenHash},${session.expiresAt} from removed) insert into account_security_events(user_id,actor_user_id,school_id,event_type,request_fingerprint) values(${targetId},${auth.currentUser.id},${targets[0].school_id},'self_session_revocation',${requestFingerprint(event)})`;
    }else{
      await sql`with removed as (select revoke_account_sessions(${targetId}) as count) insert into account_security_events(user_id,actor_user_id,school_id,event_type,request_fingerprint) select ${targetId},${auth.currentUser.id},${targets[0].school_id},'admin_session_revocation',${requestFingerprint(event)} from removed`;
    }
    return json(200,{message:"Sessions revoked"},session?{"Set-Cookie":session.cookie}:{});
  }catch(error){return safeServerError(error,"Session revocation failed");}
}
