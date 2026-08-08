export default function TeacherShellChrome({ menuSkin, onOpenSettings, onMinimize, onClose, soundControlIds = null }) {
  if (!menuSkin) return null;
  return (
    <div className="teacher-shell-window-controls" aria-label="Application controls" data-teacher-shell-chrome="">
      <button type="button" data-teacher-control-id={soundControlIds?.settings} data-sound-category={soundControlIds ? "button" : undefined} aria-label="Open classroom settings" title="Classroom settings" onClick={onOpenSettings}><img src={menuSkin.settingsIcon} alt="" draggable="false" /></button>
      <button type="button" data-teacher-control-id={soundControlIds?.minimize} data-sound-category={soundControlIds ? "button" : undefined} aria-label="Minimize application" title="Minimize application" onClick={onMinimize}><img src={menuSkin.minimizeIcon} alt="" draggable="false" /></button>
      <button type="button" data-teacher-control-id={soundControlIds?.close} data-sound-category={soundControlIds ? "button" : undefined} aria-label="Close application" title="Close application" onClick={onClose}><img src={menuSkin.closeIcon} alt="" draggable="false" /></button>
    </div>
  );
}
