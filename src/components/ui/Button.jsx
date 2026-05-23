const variantMap = {
  primary: "button-primary",
  secondary: "button-secondary",
  ghost: "button-ghost",
  outline: "button-outline",
  danger: "button-danger",
};

const sizeMap = {
  sm: "button-sm",
  md: "button-md",
  lg: "button-lg",
  large: "button-lg",
};

export default function Button({ children, variant = "secondary", size = "md", className = "", ...props }) {
  const classes = ["button", variantMap[variant] || variantMap.secondary, sizeMap[size] || sizeMap.md, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
