import dotenv from "dotenv";
import { loadConfig } from "../lib/config";
dotenv.config({ quiet: true });
try {
  const { port } = loadConfig();
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(2000) });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
