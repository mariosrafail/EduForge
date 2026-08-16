import { motion, useReducedMotion } from "framer-motion";

export function HostedBuilderRouteTransition({ routeKey, children }) {
  const reduced = useReducedMotion();
  return <motion.div key={routeKey} className="hosted-builder-route" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .2 }}>{children}</motion.div>;
}
