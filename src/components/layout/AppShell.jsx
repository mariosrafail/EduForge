import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import UploadPanel from "./UploadPanel";

export default function AppShell({
  activeSection,
  setActiveSection,
  onNewCourse,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  function goToLibrary() {
    setActiveSection("library");
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <Sidebar
          activeSection={activeSection}
          onSelect={setActiveSection}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="app-workspace">
          <Topbar
            activeSection={activeSection}
            onNewCourse={onNewCourse}
            onImportMaterial={goToLibrary}
            onPreview={() => setActiveSection("preview")}
            onMenu={() => setSidebarOpen(true)}
          />
          <main className="main-content">
            <UploadPanel open={uploadOpen} onClose={() => setUploadOpen(false)} />
            {children({ openUpload: () => setUploadOpen(true) })}
          </main>
        </div>
      </div>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Κλείσιμο μενού" />}
    </div>
  );
}
