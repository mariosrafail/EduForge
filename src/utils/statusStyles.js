const statusStyles = {
  "Πρόχειρο": {
    label: "Πρόχειρο",
    variant: "draft",
    badgeClass: "badge-draft",
    dotClass: "dot-draft",
    iconClass: "text-slate-500",
  },
  "Σε εξέλιξη": {
    label: "Σε εξέλιξη",
    variant: "progress",
    badgeClass: "badge-progress",
    dotClass: "dot-progress",
    iconClass: "text-blue-600",
  },
  "Σε έλεγχο": {
    label: "Σε έλεγχο",
    variant: "review",
    badgeClass: "badge-review",
    dotClass: "dot-review",
    iconClass: "text-indigo-600",
  },
  Έτοιμο: {
    label: "Έτοιμο",
    variant: "ready",
    badgeClass: "badge-ready",
    dotClass: "dot-ready",
    iconClass: "text-emerald-600",
  },
  "Χρειάζεται υλικό": {
    label: "Χρειάζεται υλικό",
    variant: "warning",
    badgeClass: "badge-warning",
    dotClass: "dot-warning",
    iconClass: "text-amber-600",
  },
  Σφάλμα: {
    label: "Σφάλμα",
    variant: "danger",
    badgeClass: "badge-danger",
    dotClass: "dot-danger",
    iconClass: "text-red-600",
  },
};

const fallbackStatus = {
  label: "Κατάσταση",
  variant: "neutral",
  badgeClass: "badge-neutral",
  dotClass: "dot-neutral",
  iconClass: "text-slate-500",
};

export function getStatusConfig(status) {
  return statusStyles[status] || { ...fallbackStatus, label: status || fallbackStatus.label };
}

export function getStatusTone(status) {
  return getStatusConfig(status).variant;
}
