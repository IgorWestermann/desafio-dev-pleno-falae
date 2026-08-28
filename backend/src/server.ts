import Fastify from 'fastify'

const server = Fastify({ logger: true })

server.get('/health', async () => ({ status: 'ok' }))

const port = Number(process.env.PORT ?? 3333)

try {
  await server.listen({ host: '0.0.0.0', port })
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
