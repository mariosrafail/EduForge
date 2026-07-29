import { Tag } from "../../Shared.jsx";

export function AdminUserTable({
  users,
  loading,
  pendingAction,
  roleOptions,
  statusOptions,
  onUpdate,
  onDelete,
  onResendInvitation,
  onRevokeSessions,
}) {
  if (!loading && users.length === 0) {
    return (
      <div className="empty-user-state">
        <strong>Create your first user</strong>
        <span>No platform users were returned for this school yet.</span>
      </div>
    );
  }

  return (
    <div className="data-table user-data-table" aria-label="School users">
      {users.map((user, index) => (
        <div key={user.id ?? `${user.name}-${index}`}>
          <strong>{user.name}<small>{user.email || "No email"}</small></strong>
          <select
            aria-label={`Role for ${user.name}`}
            disabled={user.role === "School Admin" || Boolean(pendingAction)}
            value={user.role}
            onChange={(event) => onUpdate(user.id, "role", event.target.value)}
          >
            {(user.role === "School Admin" ? ["School Admin"] : roleOptions).map((role) => <option key={role}>{role}</option>)}
          </select>
          <small>{user.level || "No level"}</small>
          <select
            aria-label={`Status for ${user.name}`}
            disabled={Boolean(pendingAction)}
            value={user.status}
            onChange={(event) => onUpdate(user.id, "status", event.target.value)}
          >
            {statusOptions.map((status) => <option key={status}>{status}</option>)}
          </select>
          <Tag tone={user.source === "database" ? "green" : "gold"}>{user.source === "database" ? "DB" : "Mock"}</Tag>
          <Tag tone={String(user.status).toLowerCase() === "active" ? "green" : String(user.status).toLowerCase() === "paused" ? "gold" : "blue"}>{user.status}</Tag>
          {user.invitationDeliveryState && <small>Email: {user.invitationDeliveryState}</small>}
          {String(user.status).toLowerCase() === "invited" && (
            <button disabled={Boolean(pendingAction)} className="secondary-action compact-action" onClick={() => onResendInvitation(user)}>
              {pendingAction === `${user.id}:resend` ? "Resending…" : "Resend invite"}
            </button>
          )}
          {String(user.status).toLowerCase() === "active" && user.role !== "School Admin" && (
            <button disabled={Boolean(pendingAction)} className="warning-action compact-action" onClick={() => onRevokeSessions(user)}>
              {pendingAction === `${user.id}:revoke` ? "Revoking…" : "Revoke sessions"}
            </button>
          )}
          <button disabled={Boolean(pendingAction)} className="danger-action" data-sound-click="deleteRemove" onClick={() => onDelete(user.id)}>
            {pendingAction === `${user.id}:delete` ? "Deleting…" : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
