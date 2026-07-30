import { UserPlus, Users } from "lucide-react";
import { CEFR_LEVELS } from "../../../../../shared/userImport.js";
import { Card } from "../../Shared.jsx";
import { AdminUserCsvImport } from "../components/AdminUserCsvImport.jsx";
import { AdminUserTable } from "../components/AdminUserTable.jsx";

export function AdminUsersSection({
  newUser,
  setNewUser,
  creatableRoleOptions,
  users,
  usersLoading,
  usersError,
  apiFallback,
  userCreated,
  userActionStatus,
  savingUser,
  pendingUserAction,
  statusOptions,
  onCreateUser,
  onImportOpen,
  onUsersImported,
  onUpdateUser,
  onDeleteUser,
  onResendInvitation,
  onRevokeSessions,
}) {
  return (
    <section className="admin-section-panel">
      <Card>
        <div className="card-heading">
          <div><span className="eyebrow"><Users size={15} /> User management</span><h2>Users for the Ultimate B2 package</h2></div>
          <AdminUserCsvImport onOpen={onImportOpen} onImported={onUsersImported} />
        </div>
        <form className="create-user-form" onSubmit={onCreateUser}>
          <label>Name<input value={newUser.name} placeholder="e.g. Elena Markou" onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} /></label>
          <label>Email<input required type="email" value={newUser.email} placeholder="sofia@example.com" onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} /></label>
          <label>
            Role
            <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
              {creatableRoleOptions.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label>
            CEFR level
            <select value={newUser.level} onChange={(event) => setNewUser({ ...newUser, level: event.target.value })}>
              {CEFR_LEVELS.map((level) => <option key={level}>{level}</option>)}
            </select>
          </label>
          <button className="primary-action" data-sound-click="submit" type="submit" disabled={savingUser}>
            <UserPlus size={17} /> {savingUser ? "Inviting…" : "Send invitation"}
          </button>
        </form>
        {usersLoading && <div className="inline-status">Loading users from the school account…</div>}
        {apiFallback && <div className="inline-status error">Database API unavailable. No local user changes were applied.{usersError ? ` (${usersError})` : ""}</div>}
        {userCreated && !apiFallback && <div className="inline-status success">Invitation account saved to the database.</div>}
        {userActionStatus && <div className="inline-status success">{userActionStatus}</div>}
        <AdminUserTable
          users={users}
          loading={usersLoading}
          pendingAction={pendingUserAction}
          roleOptions={creatableRoleOptions}
          statusOptions={statusOptions}
          onUpdate={onUpdateUser}
          onDelete={onDeleteUser}
          onResendInvitation={onResendInvitation}
          onRevokeSessions={onRevokeSessions}
        />
      </Card>
    </section>
  );
}
