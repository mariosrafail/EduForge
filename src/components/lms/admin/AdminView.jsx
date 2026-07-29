import { useCallback, useEffect, useState } from "react";
import { listTeacherClasses } from "../../../services/classApi.js";
import {
  deleteUser as deleteUserRequest,
  inviteUser,
  listUsers,
  revokeUserSessions,
  roleOptions,
  roleToDb,
  statusOptions,
  updateUser as updateUserRequest,
} from "../../../services/usersApi.js";
import { PortalShell } from "../shared/PortalShell.jsx";
import { ALLOWED_PRIMARY_COLORS } from "./adminConfig.js";
import { contrastWithWhite } from "./adminColorUtils.js";
import { adminNavItems, adminRouteForSection } from "./adminPortalConfig.js";
import {
  AdminBooksClassesSection,
  AdminIntegrationsSection,
  AdminPublisherIntelligenceSection,
} from "./sections/AdminOperationsSections.jsx";
import { AdminOverviewSection } from "./sections/AdminOverviewSection.jsx";
import { AdminSchoolSetupSection } from "./sections/AdminSchoolSetupSection.jsx";
import { AdminUsersSection } from "./sections/AdminUsersSection.jsx";

const emptyUser = { name: "", email: "", role: "Student", level: "B2", status: "Invited" };

export function AdminView({ brand, setBrand, initialSection = "overview", navigateTo, currentUser = null }) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [completedRollout, setCompletedRollout] = useState(["Create school"]);
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [exported, setExported] = useState(false);
  const [newUser, setNewUser] = useState(emptyUser);
  const [createdUsers, setCreatedUsers] = useState([]);
  const [adminClasses, setAdminClasses] = useState([]);
  const [classesError, setClassesError] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [apiFallback, setApiFallback] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [pendingUserAction, setPendingUserAction] = useState("");
  const [userCreated, setUserCreated] = useState(false);
  const [userActionStatus, setUserActionStatus] = useState("");
  const [primaryColorWarning, setPrimaryColorWarning] = useState("");
  const creatableRoleOptions = roleOptions.filter((role) => role !== "School Admin");
  const selectedPrimaryColor = ALLOWED_PRIMARY_COLORS.some((option) => option.value === String(brand.primary || "").toLowerCase())
    ? String(brand.primary).toLowerCase()
    : ALLOWED_PRIMARY_COLORS[0].value;

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      setCreatedUsers(await listUsers());
      setApiFallback(false);
    } catch (error) {
      setUsersError(error.message);
      setApiFallback(true);
      setCreatedUsers([]);
      throw error;
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers().catch(() => {});
    listTeacherClasses().then(setAdminClasses).catch((error) => setClassesError(error.message));
  }, [loadUsers]);

  useEffect(() => setActiveSection(initialSection), [initialSection]);

  useEffect(() => {
    const normalizedPrimary = String(brand.primary || "").toLowerCase();
    if (!ALLOWED_PRIMARY_COLORS.some((option) => option.value === normalizedPrimary)) {
      setBrand({ ...brand, primary: ALLOWED_PRIMARY_COLORS[0].value });
    }
  }, [brand, setBrand]);

  const goToSection = (sectionId) => {
    setActiveSection(sectionId);
    navigateTo?.(adminRouteForSection(sectionId));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSavingUser(true);
    setUsersError("");
    setUserCreated(false);
    try {
      const created = await inviteUser({
        name: newUser.name.trim() || `Demo ${newUser.role}`,
        email: newUser.email,
        role: newUser.role,
        level: newUser.level,
      });
      await loadUsers();
      setUserActionStatus(created.invitationDeliveryState === "failed"
        ? "Invitation created, but email delivery failed. You can resend it."
        : "Invitation sent successfully.");
      setUserCreated(true);
      setNewUser(emptyUser);
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setSavingUser(false);
    }
  };

  const updateUser = async (id, field, value) => {
    const existing = createdUsers.find((user) => user.id === id);
    if (!existing || !window.confirm(`Confirm ${field} change for ${existing.name}? Existing sessions will be revoked.`)) return;
    setPendingUserAction(`${id}:${field}`);
    try {
      await updateUserRequest(id, { [field]: roleToDb(value) });
      await loadUsers();
      setUserActionStatus("Account updated and existing sessions revoked.");
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setPendingUserAction("");
    }
  };

  const deleteUser = async (id) => {
    const existing = createdUsers.find((user) => user.id === id);
    if (!existing || !window.confirm(`Permanently delete ${existing.name}? This cannot be undone.`)) return;
    setPendingUserAction(`${id}:delete`);
    try {
      await deleteUserRequest(id);
      await loadUsers();
      setUserActionStatus("Account deleted.");
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setPendingUserAction("");
    }
  };

  const resendInvitation = async (user) => {
    setPendingUserAction(`${user.id}:resend`);
    setUsersError("");
    try {
      const result = await inviteUser(user, true);
      await loadUsers();
      setUserActionStatus(result.invitationDeliveryState === "failed" ? "Invitation renewed, but email delivery failed." : "Invitation resent successfully.");
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setPendingUserAction("");
    }
  };

  const forceRevokeSessions = async (user) => {
    if (!window.confirm(`Sign ${user.name} out of all current sessions?`)) return;
    setPendingUserAction(`${user.id}:revoke`);
    setUsersError("");
    try {
      await revokeUserSessions(user.id);
      await loadUsers();
      setUserActionStatus("Sessions revoked successfully.");
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setPendingUserAction("");
    }
  };

  const applyPrimaryColor = (nextColor) => {
    const normalized = String(nextColor || "").toLowerCase();
    const allowed = ALLOWED_PRIMARY_COLORS.some((option) => option.value === normalized);
    if (!allowed || contrastWithWhite(normalized) < 4.5) {
      setPrimaryColorWarning("Primary color must be a dark, high-contrast shade that stays readable with white text.");
      return;
    }
    setPrimaryColorWarning("");
    setBrand({ ...brand, primary: normalized });
  };

  return (
    <div className="workspace admin-workspace">
      <PortalShell
        title="School Admin"
        profile={currentUser?.full_name || "School administrator"}
        subtitle={brand.schoolName}
        navItems={adminNavItems}
        activeItem={activeSection}
        onNavigate={goToSection}
        variant="admin-portal-shell"
      >
        {activeSection === "overview" && (
          <AdminOverviewSection
            completedRollout={completedRollout}
            onToggleRollout={(action) => setCompletedRollout((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action])}
            onOpenLicensing={() => goToSection("books-classes")}
          />
        )}
        {activeSection === "school-setup" && (
          <AdminSchoolSetupSection
            brand={brand}
            selectedPrimaryColor={selectedPrimaryColor}
            primaryColorWarning={primaryColorWarning}
            onBrandChange={setBrand}
            onPrimaryColorChange={applyPrimaryColor}
          />
        )}
        {activeSection === "users" && (
          <AdminUsersSection
            newUser={newUser}
            setNewUser={setNewUser}
            creatableRoleOptions={creatableRoleOptions}
            users={createdUsers}
            usersLoading={usersLoading}
            usersError={usersError}
            apiFallback={apiFallback}
            userCreated={userCreated}
            userActionStatus={userActionStatus}
            savingUser={savingUser}
            pendingUserAction={pendingUserAction}
            statusOptions={statusOptions}
            onCreateUser={handleCreateUser}
            onImport={() => setUserCreated(true)}
            onUpdateUser={updateUser}
            onDeleteUser={deleteUser}
            onResendInvitation={resendInvitation}
            onRevokeSessions={forceRevokeSessions}
          />
        )}
        {activeSection === "books-classes" && <AdminBooksClassesSection classes={adminClasses} error={classesError} />}
        {activeSection === "publisher-intelligence" && <AdminPublisherIntelligenceSection exported={exported} onExport={() => setExported(true)} />}
        {activeSection === "integrations" && <AdminIntegrationsSection selectedIntegration={selectedIntegration} onSelect={setSelectedIntegration} />}
      </PortalShell>
    </div>
  );
}
