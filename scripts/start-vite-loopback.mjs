import { createServer } from "vite";
import { LOCAL_DEMO_PORTS } from "./_local-demo-ports.mjs";

const server = await createServer({
  server: { host: "localhost", port: LOCAL_DEMO_PORTS.lmsVite, strictPort: true },
});
await server.listen();
server.printUrls();

async function close(signal) {
  await server.close();
  process.kill(process.pid, signal);
}
process.once("SIGINT", () => close("SIGINT"));
process.once("SIGTERM", () => close("SIGTERM"));

await new Promise(() => {});
