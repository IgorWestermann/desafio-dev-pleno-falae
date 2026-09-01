# Falaê! — Processamento de avaliações

Aplicação full stack para cadastrar avaliações, persistir os dados e processar a análise de forma assíncrona sem bloquear a API.

## Executar o projeto

Pré-requisito: Docker Desktop com Docker Compose.

Opcionalmente, copie as configurações padrão:

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Suba toda a aplicação:

```bash
docker compose up --build
```

Depois que os serviços estiverem saudáveis, acesse:

- interface: http://localhost:5173
- API: http://localhost:3333
- healthcheck da API: http://localhost:3333/health
- API fake: http://localhost:4000/health

O Compose executa as migrations automaticamente antes de iniciar a API.

## Fluxo

1. O frontend envia `POST /reviews`.
2. A API valida e persiste a avaliação como `pending`.
3. A API publica um job no BullMQ e responde `202` sem aguardar a análise.
4. O worker marca a avaliação como `processing` e chama a API fake.
5. No sucesso, persiste `completed` e o resultado; na falha final, persiste `failed` e a mensagem de erro.
6. O frontend consulta `GET /reviews` a cada dois segundos para atualizar a tela.

Serviços executados pelo Compose:

- frontend React/Vite;
- API Fastify;
- worker BullMQ;
- PostgreSQL;
- Redis;
- mock oficial da API de análise.

## Contrato principal

Exemplo de cadastro:

```bash
curl --request POST http://localhost:3333/reviews \
  --header "Content-Type: application/json" \
  --header "Idempotency-Key: review-001" \
  --data '{
    "external_id": "review-001",
    "company_id": "company-001",
    "rating": 4,
    "comment": "Atendimento muito bom."
  }'
```

Endpoints:

- `POST /reviews`: cadastra e agenda o processamento;
- `GET /reviews`: lista as avaliações, seus estados e resultados;
- `GET /reviews/:id`: consulta uma avaliação;
- `GET /health`: verifica a API.

## Idempotência

A identidade de negócio é `(company_id, external_id)`, protegida por uma constraint única no PostgreSQL. O header `Idempotency-Key` deve ser igual ao `external_id`.

- repetição com o mesmo conteúdo reutiliza o registro e o job;
- mesmo identificador com conteúdo diferente retorna `409 Conflict`;
- o UUID da review é usado como `jobId`, evitando jobs duplicados.

Essa estratégia usa a constraint do banco para continuar segura quando requisições concorrentes chegam ao mesmo tempo.

## Falhas e retries

Cada job pode executar no máximo quatro vezes:

- timeout, falha de rede, HTTP `429` e `5xx` permitem retry;
- outros erros HTTP encerram imediatamente;
- `Retry-After` numérico é respeitado;
- sem `Retry-After`, o backoff é aproximadamente 1, 2 e 4 segundos;
- a falha definitiva persiste `failed`, `attempts` e `lastError`.

O timeout da API externa é configurado por `ANALYSIS_API_TIMEOUT_MS`.

## Testes

Com o ambiente do Compose em execução:

```bash
docker compose exec api pnpm test
```

Os testes automatizados verificam:

- persistência, repetição idêntica e conflito idempotente;
- listagem e consulta da review criada;
- classificação de HTTP `429` e leitura de `Retry-After`;
- cancelamento da chamada externa por timeout.

Builds locais, quando Node.js e pnpm estiverem instalados:

```bash
cd backend
pnpm run build
pnpm test

cd ../frontend
pnpm run build
```

## Decisões técnicas

- TypeScript em toda a aplicação.
- Fastify por oferecer uma API pequena e validação por JSON Schema.
- Prisma e PostgreSQL para persistência tipada e proteção de unicidade no banco.
- BullMQ e Redis para separar recebimento e processamento.
- Job contendo apenas `reviewId`; o worker relê o estado atual no PostgreSQL.
- Polling simples no frontend, suficiente para o escopo de uma única tela.
- Resultado da análise armazenado como JSONB para preservar o contrato do mock sem modelagem excessiva.

## Limitações

- Existe uma pequena janela entre confirmar a review no PostgreSQL e publicar o job no Redis. Repetir a mesma requisição tenta reparar a publicação; em produção seria recomendável usar transactional outbox ou reconciliação periódica.
- O polling continua ativo enquanto a página permanece aberta.
- `Retry-After` é tratado no formato numérico em segundos, usado pelo mock.
- Não há autenticação, paginação ou filtros.
- Os testes automatizados não executam o ciclo completo do worker com PostgreSQL, Redis e mock; esse fluxo foi validado por smoke test integrado.
- O frontend é servido pelo preview do Vite no Compose; em produção seria servido como conteúdo estático por um servidor web dedicado.

## Próximos passos

- adicionar teste automatizado end-to-end do worker;
- implementar transactional outbox;
- interromper o polling quando não houver avaliações em processamento;
- adicionar paginação e observabilidade.

## Uso de IA

A IA foi utilizada como apoio ao raciocínio, à revisão e à implementação em TypeScript/Node.js, stack com a qual o autor possui menor familiaridade. As decisões, a priorização e a validação final permaneceram sob responsabilidade do desenvolvedor.
