import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { reviewQueue } from "./queue.js";


type CreateReviewBody = {
    external_id: string
    company_id: string
    rating: number
    comment: string
}

type CreateReviewHeaders = {
    "idempotency-key": string
}

const createReviewBodySchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "external_id",
        "company_id",
        "rating",
        "comment"
    ],
    properties: {
        external_id: {
            type: "string",
            pattern: "\\S",
            minLength: 1
        },
        company_id: {
            type: "string",
            pattern: "\\S",
            minLength: 1
        },
        rating: {
            type: "integer",
            "minimum": 1,
            "maximum": 5
        },
        comment: {
            type: "string",
            pattern: "\\S",
            minLength: 1
        }
    }
} as const

const createReviewHeadersSchema = {
    type: 'object',
    properties: {
        'idempotency-key': {
            type: 'string',
            pattern: "\\S",
            minLength: 1
        },
    },
    required: ['idempotency-key'],
} as const

export async function reviewRoutes(server: FastifyInstance) {
    server.post<{
        Body: CreateReviewBody,
        Headers: CreateReviewHeaders
    }>(
        "/reviews",
        {
            schema: {
                body: createReviewBodySchema,
                headers: createReviewHeadersSchema
            }
        },
        async (request, reply) => {
            const body = request.body;
            const idempotencyKey = request.headers["idempotency-key"];

            if (idempotencyKey !== body.external_id) {
                return reply.code(400).send({
                    message: "Idempotency-Key não corresponde ao external_id"
                })
            }

            try {
                const review = await prisma.review.create({
                    data: {
                        externalId: body.external_id,
                        companyId: body.company_id,
                        rating: body.rating,
                        comment: body.comment
                    }
                })

                await reviewQueue.add(
                    "process-review",
                    { reviewId: review.id },
                    { jobId: review.id }
                )

                return reply.code(202).send({
                    id: review.id,
                    external_id: review.externalId,
                    status: review.status
                })
            } catch (error) {
                if ((!(error instanceof Prisma.PrismaClientKnownRequestError))) {
                    throw error;
                }
                if (error.code !== "P2002") {
                    throw error
                }
                const existingReview = await prisma.review.findUnique({
                    where: {
                        companyId_externalId: {
                            companyId: body.company_id,
                            externalId: body.external_id
                        }
                    }
                })

                if (!existingReview) {
                    throw error
                }
                const sameContent =
                    existingReview.rating === body.rating &&
                    existingReview.comment === body.comment

                if (sameContent) {
                    await reviewQueue.add(
                        "process-review",
                        { reviewId: existingReview.id },
                        { jobId: existingReview.id }
                    )
                    return reply.code(200).send({
                        id: existingReview.id,
                        external_id: existingReview.externalId,
                        status: existingReview.status
                    })
                }

                return reply.code(409).send({
                    message: "Já existe uma avaliação com esse identificador e conteúdo diferente"
                })
            }
        }
    )

    server.get("/reviews", async (_request, reply) => {
        const reviews = await prisma.review.findMany({
            orderBy: {
                createdAt: "desc"
            }
        })

        return reply.send(
            reviews.map((review) => ({
                id: review.id,
                external_id: review.externalId,
                company_id: review.companyId,
                rating: review.rating,
                comment: review.comment,
                status: review.status,
                analysis: review.analysis,
                attempts: review.attempts,
                created_at: review.createdAt.toISOString(),
                processed_at: review.processedAt?.toISOString() ?? null,
                last_error: review.lastError
            }))
        )
    })

    server.get<{
        Params: {
            id: string
        }
    }>("/reviews/:id", async (request, reply) => {
        const review = await prisma.review.findUnique({
            where: {
                id: request.params.id
            }
        })

        if (!review) {
            return reply.code(404).send({
                message: "Review not found"
            })
        }

        return reply.send({
            id: review.id,
            external_id: review.externalId,
            company_id: review.companyId,
            rating: review.rating,
            comment: review.comment,
            status: review.status,
            analysis: review.analysis,
            attempts: review.attempts,
            created_at: review.createdAt.toISOString(),
            processed_at: review.processedAt?.toISOString() ?? null,
            last_error: review.lastError
        })
    })
}
