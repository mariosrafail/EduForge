const noOp = () => {};

export default function TeacherBookNavigationCore({
  renderIcon,
  onHome,
  onBack,
  onPrevious = noOp,
  onNext = noOp,
  previousDisabled = true,
  nextDisabled = true,
  contextAction = null,
  contextActions = null,
  internalNavigation = null,
}) {
  const actions = contextActions || (contextAction ? [contextAction] : []);
  return (
    <nav className="teacher-book-navigation" aria-label="Book navigation" data-teacher-book-navigation="">
      <button type="button" onClick={onHome} aria-label="Home" title="Home">{renderIcon("home")}</button>
      <button type="button" onClick={onBack} aria-label="Back" title="Back">{renderIcon("back")}</button>
      <button type="button" disabled={previousDisabled} onClick={onPrevious} aria-label="Previous page" title="Previous page">{renderIcon("previous")}</button>
      <button type="button" disabled={nextDisabled} onClick={onNext} aria-label="Next page" title="Next page">{renderIcon("next")}</button>
      {internalNavigation && <>
        <button type="button" className="teacher-book-navigation-internal" disabled={internalNavigation.previousDisabled} onClick={internalNavigation.onPrevious} aria-label="Previous activity part" title="Previous activity part">{renderIcon(internalNavigation.previousDisabled ? "previousInternalDisabled" : "previousInternal")}</button>
        <button type="button" className="teacher-book-navigation-internal" disabled={internalNavigation.nextDisabled} onClick={internalNavigation.onNext} aria-label="Next activity part" title="Next activity part">{renderIcon(internalNavigation.nextDisabled ? "nextInternalDisabled" : "nextInternal")}</button>
      </>}
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`teacher-book-navigation-context teacher-book-navigation-context--${action.id}`}
          onClick={action.onClick}
          aria-label={action.ariaLabel || action.label}
          aria-pressed={action.active}
          title={action.title || action.label}
        >{renderIcon(action.activeIconName && action.active ? action.activeIconName : action.iconName)}</button>
      ))}
      <button type="button" className="teacher-book-navigation-edition" onClick={noOp} aria-label="Grammar Book" title="Grammar Book"><span>GB</span></button>
      <button type="button" className="teacher-book-navigation-edition" onClick={noOp} aria-label="Workbook" title="Workbook"><span>WB</span></button>
    </nav>
  );
}
