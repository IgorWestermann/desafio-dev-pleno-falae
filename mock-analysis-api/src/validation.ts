import { HttpError } from "./http-utils.ts";
import type { AnalyzeRequest, MockScenario } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
  options: { minLength: number; maxLength: number },
): string {
  const value = body[field];

  if (typeof value !== "string") {
    throw new HttpError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: `O campo ${field} deve ser uma string.`,
      details: { field },
    });
  }

  const trimmed = value.trim();

  if (
    trimmed.length < options.minLength ||
    trimmed.length > options.maxLength
  ) {
    throw new HttpError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: `O campo ${field} deve ter entre ${options.minLength} e ${options.maxLength} caracteres.`,
      details: { field },
    });
  }

  return trimmed;
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string | undefined {
  const value = body[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: `O campo ${field}, quando informado, deve ser uma string não vazia.`,
      details: { field },
    });
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new HttpError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: `O campo ${field} deve ter no máximo ${maxLength} caracteres.`,
      details: { field },
    });
  }

  return trimmed;
}

export function validateAnalyzeRequest(value: unknown): AnalyzeRequest {
  if (!isRecord(value)) {
    throw new HttpError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "O corpo precisa ser um objeto JSON.",
    });
  }

  const reviewId = requiredString(value, "review_id", {
    minLength: 1,
    maxLength: 100,
  });
  const text = requiredString(value, "text", {
    minLength: 3,
    maxLength: 2_000,
  });
  const companyId = optionalString(value, "company_id", 100);
  const ratingValue = value.rating;

  if (
    ratingValue !== undefined &&
    (typeof ratingValue !== "number" ||
      !Number.isInteger(ratingValue) ||
      ratingValue < 1 ||
      ratingValue > 5)
  ) {
    throw new HttpError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "O campo rating, quando informado, deve ser um inteiro entre 1 e 5.",
      details: { field: "rating" },
    });
  }

  const request: AnalyzeRequest = {
    review_id: reviewId,
    text,
  };

  if (companyId !== undefined) {
    request.company_id = companyId;
  }

  if (typeof ratingValue === "number") {
    request.rating = ratingValue;
  }

  return request;
}

const VALID_SCENARIOS: readonly MockScenario[] = [
  "success",
  "slow",
  "server-error",
  "rate-limit",
];

export function parseMockScenario(
  headerValue: string | string[] | undefined,
): MockScenario | undefined {
  if (headerValue === undefined || headerValue === "") {
    return undefined;
  }

  const scenario = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (scenario !== undefined && VALID_SCENARIOS.includes(scenario as MockScenario)) {
    return scenario as MockScenario;
  }

  throw new HttpError({
    status: 400,
    code: "INVALID_MOCK_SCENARIO",
    message: `x-mock-scenario deve ser um destes valores: ${VALID_SCENARIOS.join(", ")}.`,
  });
}
