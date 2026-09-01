import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createMockServer } from "../src/app.ts";
import type { AppConfig } from "../src/config.ts";
import { MockState } from "../src/mock-state.ts";
import type { ApiErrorBody, ApiErrorCode } from "../src/types.ts";

const BASE_CONFIG: AppConfig = {
  port: 4000,
  minDelayMs: 0,
  maxDelayMs: 0,
  failEveryN: 0,
  rateLimitMax: 10,
  rateLimitWindowMs: 10_000,
  retryAfterSeconds: 1,
  slowExtraDelayMs: 10,
  adminToken: "test-token",
  maxBodyBytes: 32_768,
};

async function startServer(
  overrides: Partial<AppConfig> = {},
  state: MockState = new MockState(),
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createMockServer({ ...BASE_CONFIG, ...overrides }, state);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

class FailingMockState extends MockState {
  override consumeRateLimit(): never {
    throw new Error("falha inesperada de teste");
  }
}

async function postAnalysis(
  baseUrl: string,
  options: { scenario?: string; clientId?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (options.scenario !== undefined) {
    headers["x-mock-scenario"] = options.scenario;
  }

  if (options.clientId !== undefined) {
    headers["x-client-id"] = options.clientId;
  }

  return fetch(`${baseUrl}/v1/analyze`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      review_id: "review-api-test",
      company_id: "company-1",
      text: "O pedido demorou e chegou frio.",
      rating: 1,
    }),
  });
}

async function assertApiError(
  response: Response,
  expected: {
    status: number;
    code: ApiErrorCode;
    retryable?: boolean;
    requestId?: string;
  },
): Promise<ApiErrorBody> {
  const body = (await response.json()) as ApiErrorBody;
  const responseRequestId = response.headers.get("x-request-id");

  assert.equal(response.status, expected.status);
  assert.equal(body.error.code, expected.code);
  assert.equal(body.error.retryable, expected.retryable ?? false);
  assert.equal(body.request_id, responseRequestId);
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);

  if (expected.requestId !== undefined) {
    assert.equal(body.request_id, expected.requestId);
  } else {
    assert.ok(body.request_id);
  }

  return body;
}

test("responde ao healthcheck", async () => {
  const app = await startServer();

  try {
    const response = await fetch(`${app.baseUrl}/health`);
    const body = (await response.json()) as { status: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
  } finally {
    await app.close();
  }
});

test("analisa uma avaliação válida", async () => {
  const app = await startServer();

  try {
    const response = await postAnalysis(app.baseUrl, { scenario: "success" });
    const body = (await response.json()) as {
      review_id: string;
      analysis: { sentiment: string; category: string };
    };

    assert.equal(response.status, 200);
    assert.equal(body.review_id, "review-api-test");
    assert.equal(body.analysis.sentiment, "negative");
    assert.equal(body.analysis.category, "delivery");
    assert.ok(response.headers.get("x-request-id"));
  } finally {
    await app.close();
  }
});

test("retorna erro de validação", async () => {
  const app = await startServer();

  try {
    const response = await fetch(`${app.baseUrl}/v1/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mock-scenario": "success",
      },
      body: JSON.stringify({ review_id: "review-invalid", text: "x" }),
    });
    const body = await assertApiError(response, {
      status: 422,
      code: "VALIDATION_ERROR",
    });

    assert.deepEqual(body.error.details, { field: "text" });
  } finally {
    await app.close();
  }
});

test("padroniza erros de leitura do corpo", async () => {
  const app = await startServer();

  try {
    const invalidJson = await fetch(`${app.baseUrl}/v1/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mock-scenario": "success",
      },
      body: "{invalid-json",
    });

    await assertApiError(invalidJson, {
      status: 400,
      code: "INVALID_JSON",
    });

    const unsupportedMediaType = await fetch(`${app.baseUrl}/v1/analyze`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    await assertApiError(unsupportedMediaType, {
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  } finally {
    await app.close();
  }
});

test("permite forçar indisponibilidade temporária", async () => {
  const app = await startServer();

  try {
    const response = await postAnalysis(app.baseUrl, {
      scenario: "server-error",
    });
    await assertApiError(response, {
      status: 503,
      code: "ANALYSIS_SERVICE_UNAVAILABLE",
      retryable: true,
    });

    assert.equal(response.headers.get("retry-after"), "1");
  } finally {
    await app.close();
  }
});

test("aplica rate limit por cliente", async () => {
  const app = await startServer({ rateLimitMax: 1 });

  try {
    const first = await postAnalysis(app.baseUrl, { clientId: "client-a" });
    const second = await postAnalysis(app.baseUrl, { clientId: "client-a" });

    assert.equal(first.status, 200);
    await assertApiError(second, {
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      retryable: true,
    });
    assert.equal(second.headers.get("retry-after"), "1");
  } finally {
    await app.close();
  }
});

test("reinicia os contadores com token administrativo", async () => {
  const app = await startServer({ rateLimitMax: 1 });

  try {
    await postAnalysis(app.baseUrl, { clientId: "client-reset" });
    const limited = await postAnalysis(app.baseUrl, {
      clientId: "client-reset",
    });
    await assertApiError(limited, {
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      retryable: true,
    });

    const reset = await fetch(`${app.baseUrl}/_admin/reset`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(reset.status, 200);

    const afterReset = await postAnalysis(app.baseUrl, {
      clientId: "client-reset",
    });
    assert.equal(afterReset.status, 200);
  } finally {
    await app.close();
  }
});

test("padroniza erros de autenticação e rota inexistente", async () => {
  const app = await startServer();
  const requestId = "request-error-contract";

  try {
    const unauthorized = await fetch(`${app.baseUrl}/_admin/reset`, {
      method: "POST",
    });

    await assertApiError(unauthorized, {
      status: 401,
      code: "UNAUTHORIZED",
    });

    const notFound = await fetch(`${app.baseUrl}/missing`, {
      headers: { "x-request-id": requestId },
    });

    await assertApiError(notFound, {
      status: 404,
      code: "NOT_FOUND",
      requestId,
    });
  } finally {
    await app.close();
  }
});

test("oculta falhas inesperadas no erro interno padronizado", async () => {
  const app = await startServer({}, new FailingMockState());

  try {
    const response = await postAnalysis(app.baseUrl);
    const body = await assertApiError(response, {
      status: 500,
      code: "INTERNAL_ERROR",
    });

    assert.equal(body.error.message, "Erro interno inesperado.");
    assert.doesNotMatch(body.error.message, /falha inesperada de teste/);
  } finally {
    await app.close();
  }
});
