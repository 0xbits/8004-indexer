# ERC-8004 Indexer Analysis & Spec

## Current State (2026-02-01)

### On-Chain Stats
| Metric | Count |
|--------|-------|
| Total Agents | 22,755 |
| Agents with URI | 10,621 (47%) |
| Transfers | 29,024 |
| Feedback entries | 647 |
| URI Updates | 173 |

### Data Quality Issues
1. **Most agents have no URI** - 53% of registrations are empty/placeholder
2. **name/description not indexed** - currently null for all agents (stored off-chain in URI)
3. **Services not indexed** - agentServices table is empty (requires URI fetching)
4. **Feedback URIs are gzip+base64** - need decoding pipeline

---

## Agent Registration Structure (ERC-8004 v1)

From analyzing top agents, here's the standard JSON structure:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "What the agent does...",
  "image": "https://...",
  "external_url": "https://...",
  "active": true,
  
  "services": [
    { "name": "MCP", "endpoint": "https://...", "version": "2025-06-18", "tools": [...] },
    { "name": "A2A", "endpoint": "https://...", "a2aSkills": [...] },
    { "name": "OASF", "endpoint": "https://...", "skills": [...], "domains": [...] },
    { "name": "web", "endpoint": "https://..." },
    { "name": "agentWallet", "endpoint": "eip155:1:0x..." },
    { "name": "email", "endpoint": "contact@..." },
    { "name": "twitter", "endpoint": "https://twitter.com/..." }
  ],
  
  "x402Support": true,  // Supports x402 payments
  "supportedTrust": ["reputation", "crypto-economic", "tee-attestation"],
  
  "registrations": [
    { "agentId": 1234, "agentRegistry": "eip155:1:0x8004A169..." }
  ],
  
  "attributes": {
    "blockchain": { "chain": "base", "chainId": 8453 },
    "protocols": ["morpho", "yearn"],
    "tags": ["defi", "yield-optimization", "portfolio-management"]
  },
  
  "updatedAt": 1769794172
}
```

---

## Service Types Discovered

| Service Type | Description | Key Fields |
|--------------|-------------|------------|
| **MCP** | Model Context Protocol | endpoint, version, tools[], capabilities[] |
| **A2A** | Agent-to-Agent | endpoint, version, a2aSkills[] |
| **OASF** | Open Agent Skills Framework | endpoint, skills[], domains[] |
| **web** | Website | endpoint |
| **agentWallet** | On-chain identity | endpoint (CAIP-10 format) |
| **email** | Contact | endpoint |
| **twitter/x** | Social | endpoint |
| **custom** | Other | endpoint |

---

## URI Formats

| Format | Count | Example |
|--------|-------|---------|
| HTTPS | ~95% | `https://example.com/.well-known/erc8004.json` |
| IPFS | ~3% | `ipfs://Qm...` or `https://ipfs.io/ipfs/...` |
| data:base64 | ~2% | `data:application/json;base64,...` |

---

## Feedback Structure

On-chain feedback contains:
- `agentId` - Agent being reviewed
- `clientAddress` - Reviewer wallet
- `value` / `valueDecimals` - Score (typically 0-100)
- `tag1`, `tag2` - Categories (mostly unused currently)
- `feedbackURI` - Off-chain details (gzip+base64 JSON)
- `isRevoked` - If feedback was revoked

---

## What Needs to be Indexed/Processed

### Phase 1: URI Fetching (Background Job)
- Fetch `agentURI` for all agents
- Handle HTTPS, IPFS, data: URIs
- Parse JSON and store:
  - `name`, `description`, `image`
  - `active`, `x402Support`
  - `supportedTrust[]`
  - `updatedAt`

### Phase 2: Service Extraction
- Parse `services[]` array
- Normalize service types
- Store in `agentServices` table:
  - MCP endpoints + tools
  - A2A endpoints + skills
  - OASF endpoints + skills + domains
  - Contact info (twitter, email, web)

### Phase 3: Tags & Skills Indexing
- Extract from `attributes.tags[]`
- Extract from service skills
- Build searchable skill taxonomy
- Common tags: defi, trading, analytics, portfolio, yield, nft, gaming

### Phase 4: Scoring System
Build composite score from:
1. **Feedback score** - Avg rating (value/100)
2. **Activity score** - Recent URI updates, registrations
3. **Completeness score** - Has name, description, services, image
4. **Trust score** - Number of trust mechanisms supported
5. **Engagement score** - Feedback count, transfer count

---

## API Endpoints Needed

### Discovery
- `GET /agents/trending` - Top by recent feedback + activity
- `GET /agents/new` - Recently registered with valid URIs
- `GET /agents/search?q=` - Full-text search (name, description, skills)
- `GET /agents/by-service?type=MCP` - Filter by service type
- `GET /agents/by-skill?skill=yield` - Filter by skill/tag
- `GET /agents/by-owner/:address` - Owner's agents

### Agent Details
- `GET /agents/:id` - Full agent with parsed metadata
- `GET /agents/:id/feedback` - Decoded feedback entries
- `GET /agents/:id/services` - All services with details

### Analytics
- `GET /stats` - Total agents, active, feedback count
- `GET /stats/services` - Service type breakdown
- `GET /stats/skills` - Popular skills/tags

---

## Implementation Priority

1. **[DONE]** Basic event indexing
2. **[TODO]** URI fetching worker (cron job)
3. **[TODO]** Service extraction & normalization  
4. **[TODO]** Trending/scoring algorithm
5. **[TODO]** Search index (skills, tags, description)
6. **[TODO]** API routes for discovery

---

## Top Agents by Feedback (Reference)

| Agent ID | Name | Feedback Count | Avg Rating | URI Domain |
|----------|------|----------------|------------|------------|
| 22721 | Remittance Agent | 129 | - | 8004mint.com |
| 6888 | - | 111 | - | ipfs |
| 14645 | Story Scoring Agent | 103 | - | 8004mint.com |
| 13445 | Gekko | 77 | 97.98 | gekkoterminal.xyz |
| 9382 | - | 29 | - | ipfs |
| 22690 | Gekko Analyzer | 20 | 100 | gekkoterminal.xyz |
| 22688 | Gekko Scout | 13 | 100 | gekkoterminal.xyz |
