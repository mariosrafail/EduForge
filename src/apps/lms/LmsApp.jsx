import App from "../../App.jsx";
import { SoundProvider } from "../../context/SoundContext.jsx";

export default function LmsApp() {
  return (
    <SoundProvider>
      <App />
    </SoundProvider>
  );
}
