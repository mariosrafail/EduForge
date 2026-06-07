import { useState } from "react";
import { buildClassInviteUrl } from "../../../utils/hashRoutes.js";

export function AdminInviteLink({ classItem }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = buildClassInviteUrl(classItem);

  const copyInvite = async () => {
    try {
      await navigator.clipboard?.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(true);
    }
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="class-invite-link admin-class-invite">
      <code>{inviteUrl}</code>
      <button className="secondary-action compact-action" type="button" onClick={copyInvite} data-sound-click="tab">
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
