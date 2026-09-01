import "dotenv/config"

const ANALYSIS_API_URL = process.env.ANALYSIS_API_URL
const ANALYSIS_API_TIMEOUT_MS = Number(process.env.ANALYSIS_API_TIMEOUT_MS)

if (!ANALYSIS_API_URL) {
    throw new Error("Environment variable ANALYSIS_API_URL is required")
}

if (!Number.isInteger(ANALYSIS_API_TIMEOUT_MS) || ANALYSIS_API_TIMEOUT_MS <= 0) {
    throw new Error("Environment variable ANALYSIS_API_TIMEOUT_MS must be a positive integer")
}

type AnalyzeReviewInput = {
    externalId: string,
    companyId: string,
    rating: number,
    comment: string
}

type AnalysisResult = {
    sentiment: string
    category: string
    confidence: number
    matched_keywords: string[]
}

type AnalyzeReviewResponse = {
    request_id: string
    review_id: string
    analysis: AnalysisResult
    processing_time_ms: number
    processed_at: string
}

export async function analyzeReview(
    input: AnalyzeReviewInput
): Promise<AnalyzeReviewResponse> {
    const payload = {
        review_id: input.externalId,
        company_id: input.companyId,
        rating: input.rating,
        text: input.comment
    }
    const httpResponse = await fetch(
        `${ANALYSIS_API_URL}/v1/analyze`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(ANALYSIS_API_TIMEOUT_MS)
        }
    )

    if (!httpResponse.ok) {
        const retryAfter = httpResponse.headers.get("retry-after")
        const retryAfterSeconds = retryAfter ? Number(retryAfter) : undefined

        const retryAfterMs =
            retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
                ? retryAfterSeconds * 1000
                : undefined

        const retryable =
            httpResponse.status === 429 ||
            (httpResponse.status >= 500 && httpResponse.status <= 599)

        throw new AnalysisApiError(
            `Analysis API returned HTTP ${httpResponse.status}`,
            httpResponse.status,
            retryable,
            retryAfterMs
        )
    }
    const data = await httpResponse.json()

    return data as AnalyzeReviewResponse
}

export class AnalysisApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryable: boolean,
        readonly retryAfterMs?: number
    ) {
        super(message)
        this.name = "AnalysisApiError"
    }
}
