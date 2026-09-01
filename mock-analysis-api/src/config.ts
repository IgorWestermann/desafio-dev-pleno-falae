export interface AppConfig {
  port: number;
  minDelayMs: number;
  maxDelayMs: number;
  failEveryN: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  retryAfterSeconds: number;
  slowExtraDelayMs: number;
  adminToken: string;
  maxBodyBytes: number;
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  options: { min: number; max: number },
): number {
  const rawValue = env[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw new Error(
      `${name} precisa ser um número inteiro entre ${options.min} e ${options.max}.`,
    );
  }

  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const minDelayMs = readInteger(env, "MIN_DELAY_MS", 250, {
    min: 0,
    max: 60_000,
  });
  const maxDelayMs = readInteger(env, "MAX_DELAY_MS", 900, {
    min: 0,
    max: 60_000,
  });

  if (maxDelayMs < minDelayMs) {
    throw new Error("MAX_DELAY_MS não pode ser menor que MIN_DELAY_MS.");
  }

  return {
    port: readInteger(env, "PORT", 4000, { min: 1, max: 65_535 }),
    minDelayMs,
    maxDelayMs,
    failEveryN: readInteger(env, "FAIL_EVERY_N", 5, {
      min: 0,
      max: 1_000_000,
    }),
    rateLimitMax: readInteger(env, "RATE_LIMIT_MAX", 10, {
      min: 1,
      max: 1_000_000,
    }),
    rateLimitWindowMs: readInteger(env, "RATE_LIMIT_WINDOW_MS", 10_000, {
      min: 100,
      max: 3_600_000,
    }),
    retryAfterSeconds: readInteger(env, "RETRY_AFTER_SECONDS", 2, {
      min: 1,
      max: 3_600,
    }),
    slowExtraDelayMs: readInteger(env, "SLOW_EXTRA_DELAY_MS", 2_500, {
      min: 0,
      max: 120_000,
    }),
    adminToken: env.ADMIN_TOKEN?.trim() || "change-me-before-sharing",
    maxBodyBytes: readInteger(env, "MAX_BODY_BYTES", 32_768, {
      min: 1_024,
      max: 1_048_576,
    }),
  };
}
