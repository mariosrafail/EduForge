import { handler as accountEmailDispatch } from "../../netlify/functions/account-email-dispatch.js";
import { handler as accountInvite } from "../../netlify/functions/account-invite.js";
import { handler as accountSetPassword } from "../../netlify/functions/account-set-password.js";
import { handler as accountTokenCheck } from "../../netlify/functions/account-token-check.js";
import { handler as activity } from "../../netlify/functions/activity.js";
import { handler as authChangePassword } from "../../netlify/functions/auth-change-password.js";
import { handler as authForgotPassword } from "../../netlify/functions/auth-forgot-password.js";
import { handler as authMe } from "../../netlify/functions/auth-me.js";
import { handler as authResetPassword } from "../../netlify/functions/auth-reset-password.js";
import { handler as authRevokeSessions } from "../../netlify/functions/auth-revoke-sessions.js";
import { handler as authSignin } from "../../netlify/functions/auth-signin.js";
import { handler as authSignout } from "../../netlify/functions/auth-signout.js";
import { handler as authSignup } from "../../netlify/functions/auth-signup.js";
import { handler as authStudentSignup } from "../../netlify/functions/auth-student-signup.js";
import { handler as bookContent } from "../../netlify/functions/book-content.js";
import { handler as bookLicensing } from "../../netlify/functions/book-licensing.js";
import { handler as course } from "../../netlify/functions/course.js";
import { handler as lesson } from "../../netlify/functions/lesson.js";
import { handler as lessonSubmit } from "../../netlify/functions/lesson-submit.js";
import { handler as operationalHealth } from "../../netlify/functions/operational-health.js";
import { handler as platformAdmin } from "../../netlify/functions/platform-admin.js";
import { handler as platformAdminAuth } from "../../netlify/functions/platform-admin-auth.js";
import { handler as schoolAdoptionReport } from "../../netlify/functions/school-adoption-report.js";
import { handler as schoolProfile } from "../../netlify/functions/school-profile.js";
import { handler as user } from "../../netlify/functions/user.js";
import { handler as userImport } from "../../netlify/functions/user-import.js";
import { handler as users } from "../../netlify/functions/users.js";
import { invokeNetlifyHandler } from "../shared/netlify-handler-adapter.js";

const handlers = Object.freeze({
  "account-email-dispatch": accountEmailDispatch,
  "account-invite": accountInvite,
  "account-set-password": accountSetPassword,
  "account-token-check": accountTokenCheck,
  activity,
  "auth-change-password": authChangePassword,
  "auth-forgot-password": authForgotPassword,
  "auth-me": authMe,
  "auth-reset-password": authResetPassword,
  "auth-revoke-sessions": authRevokeSessions,
  "auth-signin": authSignin,
  "auth-signout": authSignout,
  "auth-signup": authSignup,
  "auth-student-signup": authStudentSignup,
  "book-content": bookContent,
  "book-licensing": bookLicensing,
  course,
  lesson,
  "lesson-submit": lessonSubmit,
  "operational-health": operationalHealth,
  "platform-admin": platformAdmin,
  "platform-admin-auth": platformAdminAuth,
  "school-adoption-report": schoolAdoptionReport,
  "school-profile": schoolProfile,
  user,
  "user-import": userImport,
  users,
});

export const LMS_PUBLIC_HANDLER_NAMES = Object.freeze(Object.keys(handlers));

export function resolveLmsRoute(pathname) {
  if (pathname === "/platform-admin/api/auth") return { name: "platform-admin-auth", handler: platformAdminAuth };
  if (pathname === "/platform-admin/api/control") return { name: "platform-admin", handler: platformAdmin };
  const prefix = "/.netlify/functions/";
  if (!pathname.startsWith(prefix)) return null;
  const name = pathname.slice(prefix.length);
  return Object.hasOwn(handlers, name) ? { name, handler: handlers[name] } : null;
}

function notFound() {
  return new Response(JSON.stringify({ error: "Function not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function staticNotFound() {
  return new Response("Static asset not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function servePlatformAdminStaticAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("Content-Type") || "";
  if (response.status === 200 && contentType.toLowerCase().startsWith("text/html")) return staticNotFound();
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = resolveLmsRoute(url.pathname);
    if (route) return invokeNetlifyHandler(route.handler, request, { context: { lmsAssets: env.ASSETS, lmsOrigin: url.origin } });
    if (url.pathname.startsWith("/.netlify/functions/")) return notFound();

    if (url.pathname.startsWith("/platform-admin/")) {
      const finalSegment = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
      if (!finalSegment.includes(".")) {
        const adminUrl = new URL(url);
        adminUrl.pathname = "/platform-admin/";
        return env.ASSETS.fetch(new Request(adminUrl, request));
      }
      return servePlatformAdminStaticAsset(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
