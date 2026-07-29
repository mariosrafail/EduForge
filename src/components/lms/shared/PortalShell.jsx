import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, GraduationCap, KeyRound, LogOut, UserRound, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import houseLogo from "../../../assets/branding/hamilton-house-logo-houseonly.png";
import { AppChrome, AppChromeButton } from "../../app-chrome/AppChrome.jsx";
import { useSoundEffects } from "../../../context/SoundContext.jsx";

const roleDetails = {
  "Student portal": { label: "Student", icon: UserRound },
  "Teacher portal": { label: "Teacher", icon: GraduationCap },
  "School Admin": { label: "School Admin", icon: Building2 },
};

function SoundUtility() {
  const { muted, volume, toggleMuted, setVolume } = useSoundEffects();
  const [open, setOpen] = useState(false);
  const utilityRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!utilityRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        utilityRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={utilityRef} className="lms-sound-utility">
      <AppChromeButton
        icon={muted ? VolumeX : Volume2}
        iconOnly
        aria-label="Sound controls"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <div className="lms-sound-popover" role="dialog" aria-label="Sound controls">
          <button type="button" aria-pressed={!muted} onClick={toggleMuted}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <span>{muted ? "Unmute sound" : "Mute sound"}</span>
          </button>
          <label>
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              aria-label="Sound volume"
              onChange={(event) => setVolume(event.target.value)}
            />
            <strong>{Math.round(volume * 100)}%</strong>
          </label>
        </div>
      )}
    </div>
  );
}

export function PortalShell({
  title,
  profile,
  subtitle,
  navItems,
  activeItem,
  onNavigate,
  navigateTo,
  onSignOut,
  children,
  variant = "",
}) {
  const reduceMotion = useReducedMotion();
  const role = roleDetails[title] || { label: title, icon: UserRound };
  const accountName = profile || role.label;
  const goHome = () => navigateTo?.("home");
  const openAccountSecurity = () => navigateTo?.("account-security");

  const utilityActions = (
    <>
      <span className="lms-topbar-identity">
        <strong>{accountName}</strong>
        <small>{role.label}</small>
      </span>
      <SoundUtility />
      <AppChromeButton icon={KeyRound} aria-label="Account security" onClick={openAccountSecurity}>
        <span className="app-chrome-action-label">Account security</span>
      </AppChromeButton>
      <AppChromeButton icon={LogOut} tone="danger" aria-label="Sign out" onClick={onSignOut}>
        <span className="app-chrome-action-label">Sign out</span>
      </AppChromeButton>
    </>
  );

  return (
    <AppChrome
      className={`portal-shell ${variant}`}
      contentClassName="portal-main"
      brand={{
        mark: <img src={houseLogo} alt="" />,
        primary: "EduForge",
        secondary: "Hamilton House Ultimate",
        ariaLabel: "Return to role selection",
        onActivate: goHome,
      }}
      topbarContext={<span className="lms-role-context">{role.label}</span>}
      topbarActions={utilityActions}
      railContext={{
        icon: role.icon,
        title,
        profile: accountName,
        subtitle,
        navigationLabel: `${title} navigation`,
      }}
      navItems={navItems}
      activeItem={activeItem}
      onNavigate={onNavigate}
      drawerTitle={title}
      drawerSubtitle={`${accountName} · ${subtitle}`}
      drawerFooter={(
        <div className="lms-drawer-utilities">
          <AppChromeButton icon={KeyRound} onClick={openAccountSecurity}>Account security</AppChromeButton>
          <AppChromeButton icon={LogOut} tone="danger" onClick={onSignOut}>Sign out</AppChromeButton>
        </div>
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="portal-section-transition"
          key={activeItem}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </AppChrome>
  );
}
