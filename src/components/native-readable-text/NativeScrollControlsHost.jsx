import { createContext, useContext, useState } from "react";

import "./nativeReadableText.css";

export const NativeScrollControlsContext = createContext(null);

// Keep the rail outside clipped panels, within the activity's transformed stage.
export function NativeScrollControlsHost({ as: Element = "div", enabled = true, inherit = true, className = "", children, ...props }) {
  const parent = useContext(NativeScrollControlsContext);
  const [rail, setRail] = useState(null);
  const ownsRail = enabled && !(inherit && parent);
  return <Element {...props} className={`${className}${ownsRail ? " native-scroll-controls-host" : ""}`}>
    <NativeScrollControlsContext.Provider value={ownsRail ? rail : parent}>
      {children}
    </NativeScrollControlsContext.Provider>
    {ownsRail ? <div ref={setRail} className="native-scroll-controls-rail" /> : null}
  </Element>;
}
