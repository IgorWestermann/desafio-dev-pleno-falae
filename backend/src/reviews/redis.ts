import "dotenv/config"

const REDIS_URL = process.env.REDIS_URL

if (!REDIS_URL) {
    throw new Error("Environment variable REDIS_URL is required")
}

const redisUrl = new URL(REDIS_URL)

export const redisConnection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379)
}
