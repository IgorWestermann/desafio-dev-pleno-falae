import { Queue } from "bullmq"
import { redisConnection } from "./redis.js"

export const reviewQueue = new Queue<ReviewJobData>('review-analysis', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 4,
        backoff: {
            type: "analysis-api"
        }
    }
})

export type ReviewJobData = {
    reviewId: string
}
