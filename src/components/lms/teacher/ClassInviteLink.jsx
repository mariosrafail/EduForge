import { Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { buildClassInviteUrl } from "../../../utils/hashRoutes.js";

export function ClassInviteLink({ classItem }) {
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
    <div className="class-invite-link">
      <Link2 size={15} />
      <code>{inviteUrl}</code>
      <button className="secondary-action compact-action" type="button" onClick={copyInvite} data-sound-click="tab">
        <Copy size={15} /> {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
