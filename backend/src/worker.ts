import { Worker, UnrecoverableError } from "bullmq"
import { prisma } from "./prisma.js"
import { analyzeReview, AnalysisApiError } from "./reviews/analysis-api.js"
import type { ReviewJobData } from "./reviews/queue.js"
import { redisConnection } from "./reviews/redis.js"

await prisma.$connect()

const worker = new Worker<ReviewJobData>(
    "review-analysis",
    async (job) => {
        const review = await prisma.review.findUnique({
            where: {
                id: job.data.reviewId
            }
        })

        if (!review) {
            throw new UnrecoverableError(`Review ${job.data.reviewId} not found`)
        }

        try {
            const processingReview = await prisma.review.update({
                where: {
                    id: review.id
                },
                data: {
                    status: "processing",
                    attempts: {
                        increment: 1
                    },
                    lastError: null
                },
            })

            const response = await analyzeReview(processingReview)

            await prisma.review.update({
                where: {
                    id: processingReview.id
                },
                data: {
                    status: "completed",
                    analysis: {
                        sentiment: response.analysis.sentiment,
                        category: response.analysis.category,
                        confidence: response.analysis.confidence,
                        matched_keywords: response.analysis.matched_keywords
                    },
                    processedAt: new Date(response.processed_at),
                    lastError: null
                }
            })
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Unknown worker error"

            const nonRetryable =
                error instanceof AnalysisApiError &&
                !error.retryable

            const totalAttempts = job.opts.attempts ?? 1
            const finalAttempt = job.attemptsMade + 1 >= totalAttempts

            if (nonRetryable || finalAttempt) {
                await prisma.review.update({
                    where: {
                        id: review.id
                    },
                    data: {
                        status: "failed",
                        lastError: message
                    }
                })
            }

            if (nonRetryable) {
                throw new UnrecoverableError(message)
            }

            throw error
        }
    },
    {
        connection: redisConnection,
        settings: {
            backoffStrategy: (attemptsMade, type, error) => {
                if (
                    type === "analysis-api" &&
                    error instanceof AnalysisApiError &&
                    error.retryAfterMs !== undefined
                ) {
                    return error.retryAfterMs
                }

                return 1000 * 2 ** Math.max(attemptsMade - 1, 0)
            }
        }
    }
)

worker.on("completed", (job) => {
    console.log(`Review job ${job.id} completed`)
})

worker.on("failed", (job, error) => {
    console.error(`Review job ${job?.id ?? "unknown"} failed`, error)
})

worker.on("error", (error) => {
    console.error("Worker error", error)
})

async function shutdown() {
    await worker.close()
    await prisma.$disconnect()
}

process.once("SIGINT", () => {
    void shutdown()
})

process.once("SIGTERM", () => {
    void shutdown()
})
