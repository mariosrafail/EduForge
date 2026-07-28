import { createServer } from "vite";

const server = await createServer({
  server: { host: "localhost", port: 8000, strictPort: true },
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
