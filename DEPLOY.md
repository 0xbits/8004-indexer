# Deployment Reference

## What We Have

### API Keys & Credentials
- **Alchemy RPC**: `https://eth-mainnet.g.alchemy.com/v2/oBuwu1zpqtVV1PrCbiQM-`
- **Railway**: Logged in as bitsthefamiliar@proton.me (GitHub OAuth)
- **GitHub**: 0xbits

### GitHub Repos
- `0xbits/8004-indexer` - Ponder API (production-ready)
- `0xbits/agents-frontend` - Next.js frontend

### Railway Project
- Project: `8004-indexer`
- ID: `f5a8618a-e5fe-4e86-9a8c-3c0816e5cfae`
- Dashboard: https://railway.com/project/f5a8618a-e5fe-4e86-9a8c-3c0816e5cfae

### Domains
- `api.agents.b1ts.dev` → API service
- `agents.b1ts.dev` → Frontend (TODO)

### DNS (Cloudflare)
- CNAME `api.agents` → `jx1t3hkf.up.railway.app`

---

## Railway CLI Commands

### Link to project (skip service selection with Escape)
```bash
cd ~/projects/8004-indexer
railway link -p 8004-indexer
# Press Escape when asked for service
```

### Add database FIRST (before app service)
```bash
railway add --database postgres
```

### Add app service from GitHub
```bash
railway add --repo 0xbits/8004-indexer --service api
```

### Set environment variables
```bash
# Get DATABASE_URL from Postgres service
railway variables --service Postgres

# Set on api service
railway variables --service api --set "DATABASE_URL=<postgres-internal-url>"
railway variables --service api --set "DATABASE_SCHEMA=ponder"
railway variables --service api --set "PONDER_RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/oBuwu1zpqtVV1PrCbiQM-"
```

### Add custom domain
```bash
railway domain api.agents.b1ts.dev --service api
```

### Redeploy after changes
```bash
railway redeploy --service api --yes
```

### Check logs
```bash
railway logs --service api
railway logs --build
```

---

## Troubleshooting

### "Service not found" when using --service
Link to the service first:
```bash
railway service api  # or service name
```

### Database connection errors
1. Check Postgres is running: `railway logs --service Postgres`
2. Verify DATABASE_URL is set: `railway variables --service api`
3. Redeploy: `railway redeploy --service api --yes`

### DNS not working
Add CNAME record in Cloudflare:
- Type: CNAME
- Name: `api.agents` (for api.agents.b1ts.dev)
- Value: `<railway-provided-cname>.up.railway.app`

---

## Frontend Deployment (TODO)
```bash
railway add --repo 0xbits/agents-frontend --service app
railway variables --service app --set "NEXT_PUBLIC_API_URL=https://api.agents.b1ts.dev"
railway domain agents.b1ts.dev --service app
```
