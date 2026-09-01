import { createMockServer } from "./app.ts";
import { loadConfig } from "./config.ts";
import { logEvent } from "./http-utils.ts";

const config = loadConfig();
const server = createMockServer(config);

server.listen(config.port, "0.0.0.0", () => {
  logEvent("info", "server_started", {
    port: config.port,
    min_delay_ms: config.minDelayMs,
    max_delay_ms: config.maxDelayMs,
    fail_every_n: config.failEveryN,
    rate_limit_max: config.rateLimitMax,
    rate_limit_window_ms: config.rateLimitWindowMs,
  });
});

function shutdown(signal: string): void {
  logEvent("info", "server_shutdown_started", { signal });

  server.close((error) => {
    if (error !== undefined) {
      logEvent("error", "server_shutdown_failed", {
        signal,
        error: error.message,
      });
      process.exitCode = 1;
      return;
    }

    logEvent("info", "server_shutdown_completed", { signal });
    process.exitCode = 0;
  });

  setTimeout(() => {
    logEvent("error", "server_shutdown_forced", { signal });
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
