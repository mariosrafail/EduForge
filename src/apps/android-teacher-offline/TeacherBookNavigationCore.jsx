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
}) {
  return (
    <nav className="teacher-book-navigation" aria-label="Book navigation" data-teacher-book-navigation="">
      <button type="button" onClick={onHome} aria-label="Home" title="Home">{renderIcon("home")}</button>
      <button type="button" onClick={onBack} aria-label="Back" title="Back">{renderIcon("back")}</button>
      <button type="button" disabled={previousDisabled} onClick={onPrevious} aria-label="Previous page" title="Previous page">{renderIcon("previous")}</button>
      <button type="button" disabled={nextDisabled} onClick={onNext} aria-label="Next page" title="Next page">{renderIcon("next")}</button>
      {contextAction && (
        <button
          type="button"
          className={`teacher-book-navigation-context teacher-book-navigation-context--${contextAction.id}`}
          onClick={contextAction.onClick}
          aria-label={contextAction.ariaLabel || contextAction.label}
          aria-pressed={contextAction.active}
          title={contextAction.title || contextAction.label}
        >{renderIcon(contextAction.activeIconName && contextAction.active ? contextAction.activeIconName : contextAction.iconName)}</button>
      )}
      <button type="button" className="teacher-book-navigation-edition" onClick={noOp} aria-label="Grammar Book" title="Grammar Book"><span>GB</span></button>
      <button type="button" className="teacher-book-navigation-edition" onClick={noOp} aria-label="Workbook" title="Workbook"><span>WB</span></button>
    </nav>
  );
}
