import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { analyzeReview, deterministicDelayMs } from "./analyzer.ts";
import type { AppConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import {
  HttpError,
  logEvent,
  readJsonBody,
  sendJson,
  sleep,
} from "./http-utils.ts";
import { MockState } from "./mock-state.ts";
import type { RateLimitResult } from "./mock-state.ts";
import type { ApiErrorBody, ApiErrorCode, MockScenario } from "./types.ts";
import {
  parseMockScenario,
  validateAnalyzeRequest,
} from "./validation.ts";

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestIdFrom(request: IncomingMessage): string {
  const provided = firstHeaderValue(request.headers["x-request-id"])?.trim();
  return provided || randomUUID();
}

function clientKeyFrom(request: IncomingMessage): string {
  const provided = firstHeaderValue(request.headers["x-client-id"])?.trim();
  return provided || request.socket.remoteAddress || "unknown-client";
}

function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-limit": result.limit.toString(),
    "x-ratelimit-remaining": result.remaining.toString(),
    "x-ratelimit-reset": Math.ceil(result.resetAt / 1_000).toString(),
  };
}

function sendApiError(
  response: ServerResponse,
  options: {
    status: number;
    requestId: string;
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    details?: unknown;
    headers?: Readonly<Record<string, string>>;
  },
): void {
  const body: ApiErrorBody = {
    error: {
      code: options.code,
      message: options.message,
      retryable: options.retryable,
    },
    request_id: options.requestId,
  };

  if (options.details !== undefined) {
    body.error.details = options.details;
  }

  sendJson(response, options.status, body, {
    "x-request-id": options.requestId,
    ...(options.headers ?? {}),
  });
}

function isAuthorizedAdmin(request: IncomingMessage, token: string): boolean {
  const authorization = firstHeaderValue(request.headers.authorization);
  return authorization === `Bearer ${token}`;
}

function syntheticRateLimit(config: AppConfig): RateLimitResult {
  return {
    allowed: true,
    limit: config.rateLimitMax,
    remaining: config.rateLimitMax,
    resetAt: Date.now() + config.rateLimitWindowMs,
  };
}

async function handleAnalyze(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig,
  state: MockState,
  requestId: string,
  scenario: MockScenario | undefined,
): Promise<void> {
  const startedAt = Date.now();
  const clientKey = clientKeyFrom(request);
  let rateLimit = syntheticRateLimit(config);

  if (scenario === undefined) {
    rateLimit = state.consumeRateLimit(
      clientKey,
      startedAt,
      config.rateLimitMax,
      config.rateLimitWindowMs,
    );
  }

  if (scenario === "rate-limit" || !rateLimit.allowed) {
    logEvent("info", "analysis_rate_limited", {
      request_id: requestId,
      client_key: clientKey,
      forced: scenario === "rate-limit",
      duration_ms: Date.now() - startedAt,
    });

    throw new HttpError({
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Limite temporário de requisições atingido. Tente novamente depois.",
      retryable: true,
      headers: {
        ...rateLimitHeaders(rateLimit),
        "retry-after": config.retryAfterSeconds.toString(),
      },
    });
  }

  const rawBody = await readJsonBody(request, config.maxBodyBytes);
  const body = validateAnalyzeRequest(rawBody);
  const sequence = state.nextSequence();
  const normalDelay = deterministicDelayMs(
    `${body.review_id}:${body.text}`,
    config.minDelayMs,
    config.maxDelayMs,
  );
  const delay =
    scenario === "slow" ? normalDelay + config.slowExtraDelayMs : normalDelay;

  await sleep(delay);

  const automaticFailure =
    scenario === undefined && state.shouldFail(sequence, config.failEveryN);

  if (scenario === "server-error" || automaticFailure) {
    logEvent("error", "analysis_failed", {
      request_id: requestId,
      review_id: body.review_id,
      sequence,
      forced: scenario === "server-error",
      duration_ms: Date.now() - startedAt,
    });

    throw new HttpError({
      status: 503,
      code: "ANALYSIS_SERVICE_UNAVAILABLE",
      message: "O serviço de análise está temporariamente indisponível.",
      retryable: true,
      headers: {
        ...rateLimitHeaders(rateLimit),
        "retry-after": config.retryAfterSeconds.toString(),
      },
    });
  }

  const analysis = analyzeReview(body);
  const finishedAt = Date.now();

  sendJson(
    response,
    200,
    {
      request_id: requestId,
      review_id: body.review_id,
      analysis,
      processing_time_ms: finishedAt - startedAt,
      processed_at: new Date(finishedAt).toISOString(),
    },
    {
      "x-request-id": requestId,
      ...rateLimitHeaders(rateLimit),
    },
  );

  logEvent("info", "analysis_completed", {
    request_id: requestId,
    review_id: body.review_id,
    sentiment: analysis.sentiment,
    category: analysis.category,
    sequence,
    scenario: scenario ?? "automatic",
    duration_ms: finishedAt - startedAt,
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig,
  state: MockState,
): Promise<void> {
  const requestId = requestIdFrom(request);
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  response.setHeader("x-request-id", requestId);

  if (method === "GET" && url.pathname === "/") {
    sendJson(response, 200, {
      name: "Falaê! Mock Review Analysis API",
      version: "1.0.0",
      endpoints: {
        health: "GET /health",
        analyze: "POST /v1/analyze",
        reset: "POST /_admin/reset",
      },
      scenarios: ["success", "slow", "server-error", "rate-limit"],
    });
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/_admin/reset") {
    if (!isAuthorizedAdmin(request, config.adminToken)) {
      throw new HttpError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Token administrativo inválido.",
      });
    }

    state.reset();
    sendJson(
      response,
      200,
      {
        status: "reset",
        timestamp: new Date().toISOString(),
      },
      { "x-request-id": requestId },
    );
    return;
  }

  if (method === "POST" && url.pathname === "/v1/analyze") {
    const scenario = parseMockScenario(request.headers["x-mock-scenario"]);
    await handleAnalyze(
      request,
      response,
      config,
      state,
      requestId,
      scenario,
    );
    return;
  }

  throw new HttpError({
    status: 404,
    code: "NOT_FOUND",
    message: "Rota não encontrada.",
  });
}

function handleRequestError(
  response: ServerResponse,
  error: unknown,
): void {
  const requestId =
    firstHeaderValue(
      response.getHeader("x-request-id") as string | string[] | undefined,
    ) ?? randomUUID();

  const httpError =
    error instanceof HttpError
      ? error
      : new HttpError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Erro interno inesperado.",
        });

  if (!(error instanceof HttpError)) {
    logEvent("error", "unhandled_request_error", {
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (response.headersSent) {
    response.destroy();
    return;
  }

  sendApiError(response, {
    status: httpError.status,
    requestId,
    code: httpError.code,
    message: httpError.message,
    retryable: httpError.retryable,
    details: httpError.details,
    headers: httpError.headers,
  });
}

export function createMockServer(
  config: AppConfig = loadConfig(),
  state: MockState = new MockState(),
): Server {
  return createServer((request, response) => {
    void routeRequest(request, response, config, state).catch((error: unknown) => {
      handleRequestError(response, error);
    });
  });
}
