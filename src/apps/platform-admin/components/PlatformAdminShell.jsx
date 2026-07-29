import React from "react";
import { LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { AppChrome, AppChromeButton } from "../../../components/app-chrome/AppChrome.jsx";
import { platformSections } from "../platformAdminNavigation.js";

export function PlatformAdminShell({ admin, activeSection, onNavigate, onSignOut, children }) {
  const signOutAction = (
    <AppChromeButton icon={LogOut} tone="danger" aria-label="Sign out" onClick={onSignOut}>
      <span className="app-chrome-action-label">Sign out</span>
    </AppChromeButton>
  );

  return (
    <AppChrome
      className="pa-shell"
      contentClassName="pa-main"
      brand={{
        mark: "E",
        primary: "EduForge",
        secondary: "Platform Administration",
      }}
      topbarContext={<span className="pa-privileged-badge"><ShieldCheck size={15} /> Restricted operator area</span>}
      topbarActions={(
        <>
          <span className="pa-topbar-identity app-chrome-identity-copy">
            <strong>{admin.full_name}</strong>
            <small>Platform Administrator</small>
          </span>
          {signOutAction}
        </>
      )}
      railContext={{
        icon: LockKeyhole,
        title: "Privileged area",
        profile: admin.full_name,
        subtitle: "Cross-school controls",
        navigationLabel: "Platform Administration navigation",
      }}
      navItems={platformSections}
      activeItem={activeSection}
      onNavigate={onNavigate}
      drawerTitle="Platform Administration"
      drawerSubtitle="Restricted operator area"
      drawerFooter={(
        <>
          <strong>{admin.full_name}</strong>
          {signOutAction}
        </>
      )}
    >
      {children}
    </AppChrome>
  );
}
