# ERC-8004 Agents API

Indexes and serves ERC-8004 Trustless Agents on Ethereum.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /stats` | Registry statistics |
| `GET /search?q=&limit=&offset=&sort=` | Search agents |
| `GET /agents/:id` | Get agent details |
| `GET /agents/:id/feedback` | Get agent feedback |
| `GET /top?by=feedback&limit=10` | Top agents |
| `POST /graphql` | Full GraphQL API |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI spec |

## Development

```bash
pnpm install
pnpm dev
```

API runs at http://localhost:42069

## Production

Requires PostgreSQL:

```bash
DATABASE_URL=postgresql://... pnpm start
```

## Docker

```bash
docker build -t agents-api .
docker run -p 42069:42069 -e DATABASE_URL=... agents-api
```

## Contracts

- **IdentityRegistry:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **ReputationRegistry:** `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

## Rate Limits

- 100 requests/minute per IP
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## License

MIT
