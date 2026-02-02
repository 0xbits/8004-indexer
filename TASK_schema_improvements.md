# Task: Improve ERC-8004 Agent Schema & Metadata Parsing

## Context
- **Project:** `~/projects/8004-indexer/` (Ponder indexer)
- **Repo:** github.com/0xbits/8004-indexer
- **Current state:** Basic metadata parsing works, but missing many fields
- **Framework:** Ponder (indexer), Hono (API), Drizzle (ORM)

## Goal
Capture ALL useful metadata from ERC-8004 agent registration URIs to power rich discovery.

## Current Schema (ponder.schema.ts)
```typescript
// Agent table has:
id, owner, agentURI, agentWallet, registeredAt, registeredBlock, registeredTxHash,
name, description, image, active, x402Support, hasMCP, hasA2A,
mcpTools (text), a2aSkills (text), feedbackCount, avgRating,
metadataFetchedAt, metadataError
```

## What's Missing (from real agent metadata)

### 1. Agent-level fields
- `externalUrl` — Main website
- `tags` — Array of tags (from attributes.tags)
- `protocols` — Array of protocols (morpho, yearn, etc.)
- `chain` — Primary chain (from attributes.blockchain.chain)
- `chainId` — Chain ID (from attributes.blockchain.chainId)
- `supportedTrust` — Array (reputation, crypto-economic, etc.)
- `updatedAt` — From metadata, not just block timestamp

### 2. MCP Tools (currently broken)
Current code looks for `service.mcpTools` but real data has `service.tools`
Also missing:
- `mcpCapabilities` — Array (tools, resources, prompts)
- Tool descriptions/schemas

### 3. Service details
Current `agentService` table only has: agentId, serviceName, endpoint, version

Missing:
- `description` — Service description
- `capabilities` — For MCP services
- `tools` — Tool names for MCP
- `skills` — Skill names for A2A

## Example Real Metadata (Gekko agent)
```json
{
  "name": "Gekko",
  "description": "...",
  "image": "https://...",
  "external_url": "https://www.gekkoterminal.xyz",
  "x402Support": true,
  "active": true,
  "supportedTrust": ["reputation", "crypto-economic"],
  "attributes": {
    "blockchain": { "chain": "base", "chainId": 8453 },
    "protocols": ["morpho", "yearn"],
    "dataFeeds": ["morpho-api", "yearn-ydaemon", "dexscreener"],
    "tags": ["defi", "yield-optimization", "portfolio-management"]
  },
  "services": [
    {
      "name": "MCP",
      "endpoint": "https://www.gekkoterminal.xyz/mcp",
      "version": "2025-11-25",
      "description": "Model Context Protocol server for LLM integration",
      "capabilities": ["tools", "resources", "prompts"],
      "tools": ["get_portfolio", "analyze_token", "get_vault_yields"]
    },
    {
      "name": "A2A",
      "endpoint": "https://.../.well-known/agent-card.json",
      "version": "0.3.0",
      "a2aSkills": ["portfolio_management", "token_analysis"]
    }
  ]
}
```

## Requirements

### 1. Update Schema (ponder.schema.ts)
- [ ] Add to `agent` table:
  - `externalUrl` (text)
  - `tags` (text, JSON array)
  - `protocols` (text, JSON array)  
  - `chain` (text)
  - `chainId` (integer)
  - `supportedTrust` (text, JSON array)
  - `mcpCapabilities` (text, JSON array)
  - `metadataUpdatedAt` (bigint, from metadata not block)

- [ ] Update `agentService` table:
  - Add `description` (text)
  - Add `capabilities` (text, JSON array)
  - Add `tools` (text, JSON array for MCP)
  - Add `skills` (text, JSON array for A2A)

### 2. Update Metadata Parser (src/IdentityRegistry.ts)
- [ ] Fix MCP tools parsing (look for `service.tools` not `service.mcpTools`)
- [ ] Extract `external_url` → `externalUrl`
- [ ] Extract `attributes.tags` → `tags`
- [ ] Extract `attributes.protocols` → `protocols`
- [ ] Extract `attributes.blockchain.chain` → `chain`
- [ ] Extract `attributes.blockchain.chainId` → `chainId`
- [ ] Extract `supportedTrust` → `supportedTrust`
- [ ] Extract MCP `capabilities` 
- [ ] Store service-level details (description, capabilities, tools, skills)

### 3. Update API (src/api/index.ts)
- [ ] Add new fields to `formatAgent()` response
- [ ] Add search filters: `?chain=base`, `?tag=defi`, `?protocol=morpho`
- [ ] Add `/stats` breakdown by chain, top tags, top protocols

## Constraints
- Must use Ponder patterns (onchainTable, etc.)
- Schema changes require fresh DATABASE_SCHEMA (Ponder limitation)
- Keep backward compatible where possible
- JSON arrays stored as text (Ponder doesn't support native arrays well)

## Files to Modify
1. `ponder.schema.ts` — Add new columns
2. `src/IdentityRegistry.ts` — Update `fetchAndParseURI()` and event handlers
3. `src/api/index.ts` — Update `formatAgent()` and add filters

## Success Criteria
- [ ] All fields from example metadata are captured
- [ ] MCP tools correctly parsed (not null)
- [ ] Search by tag/protocol/chain works
- [ ] API returns enriched agent data
- [ ] Builds without errors
- [ ] Existing functionality not broken

## Testing
After changes:
1. Set new `DATABASE_SCHEMA` env var
2. Deploy and let re-index
3. Check: `curl https://agents-api.b1ts.dev/agents/13445` should have all new fields
4. Check: `curl https://agents-api.b1ts.dev/search?tag=defi` should work

## Notes
- Ponder is strict about schema changes — needs fresh schema name each deploy
- Metadata fetching happens during indexing (not deterministic, but acceptable)
- Some agents have malformed metadata — handle gracefully with try/catch
