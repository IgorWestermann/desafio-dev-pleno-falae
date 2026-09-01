import Fastify from 'fastify'
import { prisma } from "./prisma.js"
import { reviewRoutes } from "./reviews/routes.js"
import { reviewQueue } from "./reviews/queue.js"

const server = Fastify({ logger: true })

server.addHook('onClose', async ()=> {
  await reviewQueue.close()
  await prisma.$disconnect()
})

server.get('/health', async () => ({ status: 'ok' }))

const port = Number(process.env.PORT ?? 3333)

try {
  await prisma.$connect();

  server.register(reviewRoutes);

  await server.listen({ host: '0.0.0.0', port })
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
