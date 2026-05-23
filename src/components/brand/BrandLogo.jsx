import { BookOpen, GraduationCap, Layers3, Sparkles } from "lucide-react";

const sizeClasses = {
  sm: "brand-logo-sm",
  md: "brand-logo-md",
  lg: "brand-logo-lg",
};

export default function BrandLogo({ compact = false, showText = true, size = "md", className = "" }) {
  return (
    <div className={["brand-logo", sizeClasses[size] || sizeClasses.md, compact ? "compact" : "", className].filter(Boolean).join(" ")}>
      <div className="brand-logo-mark" aria-hidden="true">
        <Layers3 className="brand-logo-layer" />
        <BookOpen className="brand-logo-book" />
        <Sparkles className="brand-logo-spark" />
      </div>
      {showText && (
        <div className="brand-logo-text">
          <h1>Course Forge</h1>
          {!compact && <p>Πλατφόρμα δημιουργίας ψηφιακών μαθημάτων</p>}
        </div>
      )}
      {compact && !showText && <GraduationCap className="sr-only" />}
    </div>
  );
}
