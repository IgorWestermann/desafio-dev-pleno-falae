# Falaê! | API fake de análise

Feedback chega o tempo todo. Dependências externas, nem sempre.

Esta API faz o papel do serviço de análise no desafio técnico: recebe uma
avaliação, identifica sentimento e categoria e, de vez em quando, coloca a
resiliência da aplicação à prova com atrasos, rate limit e falhas temporárias.
Tudo acontece localmente, sem chamadas para serviços reais.

Ela foi escrita em TypeScript usando apenas APIs nativas do Node.js. Em
produção, o container executa os arquivos `.ts` diretamente com o type stripping
estável do Node.js 24, sem dependências de runtime.

## Comece por aqui

Na raiz do desafio, suba o ambiente completo:

```bash
cp .env.example .env
docker compose up --build
```

Depois, confirme que a API está pronta para conversar:

```bash
curl http://localhost:4000/health
```

## Rodando somente a API fake

Dentro deste diretório:

```bash
docker build -t falae-mock-analysis-api .
docker run --rm -p 4000:4000 falae-mock-analysis-api
```

## Desenvolvimento local

Você vai precisar do Node.js 24.12 ou superior.

```bash
npm install
npm run dev
```

Para validar tudo sem gerar artefatos de build:

```bash
npm run check
```

Esse comando executa o typecheck e os testes automatizados.

## Converse com a API

```bash
curl --request POST 'http://localhost:4000/v1/analyze' \
  --header 'Content-Type: application/json' \
  --header 'x-mock-scenario: success' \
  --data-raw '{
    "review_id": "review-order-123",
    "company_id": "company-456",
    "rating": 2,
    "text": "O pedido demorou muito e chegou frio."
  }'
```

O contrato completo está no [`openapi.yaml`](openapi.yaml). Também deixamos
requisições prontas em [`../examples/requests.http`](../examples/requests.http)
e [`../examples/curl-examples.sh`](../examples/curl-examples.sh).

## Escolha o comportamento

Sem `x-mock-scenario`, atrasos, falhas e rate limit seguem as configurações do
`.env`. Para criar testes determinísticos, escolha um destes cenários:

| Cenário | Resposta |
|---|---|
| `success` | análise concluída com sucesso |
| `slow` | sucesso depois de um atraso extra |
| `server-error` | erro temporário `503` com `Retry-After` |
| `rate-limit` | limite atingido `429` com `Retry-After` |

Use `x-client-id` para que clientes de teste diferentes não compartilhem o
mesmo contador de rate limit.

## Um erro, sempre o mesmo contrato

Não importa se o problema veio do payload, da autenticação, do rate limit ou de
uma falha inesperada: a resposta mantém o mesmo formato.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "O campo text deve ter entre 3 e 2000 caracteres.",
    "retryable": false,
    "details": { "field": "text" }
  },
  "request_id": "2f13be1d-ef75-4ed3-bf9c-ad9f16552d77"
}
```

- `code` é estável e serve para decisões no código;
- `message` explica o que aconteceu;
- `retryable` indica se vale tentar novamente;
- `details` aparece apenas quando existe contexto adicional;
- `request_id` conecta resposta e logs.

Falhas temporárias também retornam `Retry-After`. Se a requisição enviar um
`x-request-id`, o mesmo valor volta no header e no corpo da resposta — assim a
conversa pode ser acompanhada de ponta a ponta.
