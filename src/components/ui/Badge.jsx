import { getStatusConfig } from "../../utils/statusStyles";

export default function Badge({ children, status, tone, showDot = true, className = "" }) {
  const config = getStatusConfig(status || children);
  const variant = tone || config.variant;

  return (
    <span className={["badge", `badge-${variant}`, className].filter(Boolean).join(" ")}>
      {showDot && <span className={["badge-dot", config.dotClass].filter(Boolean).join(" ")} />}
      {config.label || children}
    </span>
  );
}
