import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiErrorCode } from "./types.ts";

interface HttpErrorOptions {
  status: number;
  code: ApiErrorCode;
  message: string;
  retryable?: boolean;
  details?: unknown;
  headers?: Readonly<Record<string, string>>;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly headers: Readonly<Record<string, string>>;

  constructor(options: HttpErrorOptions) {
    super(options.message);
    this.name = "HttpError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.headers = options.headers ?? {};

    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Envie o corpo da requisição como application/json.",
    });
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > maxBodyBytes) {
      throw new HttpError({
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: `O corpo da requisição excedeu ${maxBodyBytes} bytes.`,
      });
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (rawBody === "") {
    throw new HttpError({
      status: 400,
      code: "EMPTY_BODY",
      message: "O corpo da requisição não pode ficar vazio.",
    });
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError({
      status: 400,
      code: "INVALID_JSON",
      message: "O corpo enviado não contém um JSON válido.",
    });
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  const serialized = JSON.stringify(body);

  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(serialized).toString(),
    "cache-control": "no-store",
    ...headers,
  });
  response.end(serialized);
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function logEvent(
  level: "info" | "error",
  event: string,
  attributes: Readonly<Record<string, unknown>>,
): void {
  const logLine = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...attributes,
  });

  if (level === "error") {
    console.error(logLine);
    return;
  }

  console.log(logLine);
}
