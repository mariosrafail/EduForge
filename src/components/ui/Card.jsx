const paddingMap = {
  none: "card-padding-none",
  sm: "card-padding-sm",
  md: "card-padding-md",
  lg: "card-padding-lg",
};

export default function Card({
  children,
  as: Component = "section",
  padding = "md",
  interactive = false,
  className = "",
  ...props
}) {
  const classes = ["card", paddingMap[padding] || paddingMap.md, interactive ? "card-interactive" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
