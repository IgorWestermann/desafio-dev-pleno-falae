export type Sentiment = "positive" | "neutral" | "negative";

export type ReviewCategory =
  | "delivery"
  | "service"
  | "food"
  | "price"
  | "environment"
  | "general";

export type MockScenario =
  | "success"
  | "slow"
  | "server-error"
  | "rate-limit";

export type ApiErrorCode =
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "EMPTY_BODY"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "INVALID_MOCK_SCENARIO"
  | "RATE_LIMIT_EXCEEDED"
  | "ANALYSIS_SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export interface AnalyzeRequest {
  review_id: string;
  company_id?: string;
  text: string;
  rating?: number;
}

export interface AnalysisResult {
  sentiment: Sentiment;
  category: ReviewCategory;
  confidence: number;
  matched_keywords: string[];
}

export interface AnalyzeResponse {
  request_id: string;
  review_id: string;
  analysis: AnalysisResult;
  processing_time_ms: number;
  processed_at: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
  request_id: string;
}
