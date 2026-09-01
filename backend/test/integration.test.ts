import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import Fastify from "fastify"
import { prisma } from "../src/prisma.js"
import { reviewQueue } from "../src/reviews/queue.js"
import { reviewRoutes } from "../src/reviews/routes.js"

test("API persists, deduplicates and lists reviews", async () => {
    const app = Fastify()
    await prisma.$connect()
    await app.register(reviewRoutes)

    const externalId = `integration-${Date.now()}`
    const payload = {
        external_id: externalId,
        company_id: "integration-company",
        rating: 4,
        comment: "Integration test review"
    }

    try {
        const created = await app.inject({
            method: "POST",
            url: "/reviews",
            headers: {
                "idempotency-key": externalId
            },
            payload
        })

        assert.equal(created.statusCode, 202)
        const createdBody = created.json() as { id: string }

        const duplicate = await app.inject({
            method: "POST",
            url: "/reviews",
            headers: {
                "idempotency-key": externalId
            },
            payload
        })

        assert.equal(duplicate.statusCode, 200)
        assert.equal((duplicate.json() as { id: string }).id, createdBody.id)

        const conflict = await app.inject({
            method: "POST",
            url: "/reviews",
            headers: {
                "idempotency-key": externalId
            },
            payload: {
                ...payload,
                comment: "Different content"
            }
        })

        assert.equal(conflict.statusCode, 409)

        const list = await app.inject({
            method: "GET",
            url: "/reviews"
        })

        assert.equal(list.statusCode, 200)
        const reviews = list.json() as Array<{ id: string }>
        assert.ok(reviews.some((review) => review.id === createdBody.id))

        const detail = await app.inject({
            method: "GET",
            url: `/reviews/${createdBody.id}`
        })

        assert.equal(detail.statusCode, 200)
    } finally {
        await app.close()
        await reviewQueue.close()
        await prisma.$disconnect()
    }
})

test("analysis client classifies rate limit and enforces timeout", async () => {
    let scenario: "rate-limit" | "slow" = "rate-limit"

    const fakeApi = createServer((_request, response) => {
        if (scenario === "rate-limit") {
            response.writeHead(429, {
                "Content-Type": "application/json",
                "Retry-After": "1"
            })
            response.end(JSON.stringify({ message: "rate limited" }))
            return
        }

        setTimeout(() => {
            response.writeHead(200, {
                "Content-Type": "application/json"
            })
            response.end(JSON.stringify({}))
        }, 100)
    })

    await new Promise<void>((resolve) => {
        fakeApi.listen(0, "127.0.0.1", resolve)
    })

    const address = fakeApi.address()

    if (!address || typeof address === "string") {
        throw new Error("Could not determine fake API port")
    }

    process.env.ANALYSIS_API_URL = `http://127.0.0.1:${address.port}`
    process.env.ANALYSIS_API_TIMEOUT_MS = "25"

    const { analyzeReview, AnalysisApiError } = await import(
        "../src/reviews/analysis-api.js"
    )

    const input = {
        externalId: "integration-analysis",
        companyId: "integration-company",
        rating: 2,
        comment: "Integration test"
    }

    try {
        await assert.rejects(
            () => analyzeReview(input),
            (error: unknown) => {
                assert.ok(error instanceof AnalysisApiError)
                assert.equal(error.status, 429)
                assert.equal(error.retryable, true)
                assert.equal(error.retryAfterMs, 1000)
                return true
            }
        )

        scenario = "slow"

        await assert.rejects(
            () => analyzeReview(input),
            (error: unknown) => {
                assert.ok(error instanceof Error)
                assert.equal(error.name, "TimeoutError")
                return true
            }
        )
    } finally {
        await new Promise<void>((resolve, reject) => {
            fakeApi.close((error) => {
                if (error) {
                    reject(error)
                    return
                }

                resolve()
            })
        })
    }
})
