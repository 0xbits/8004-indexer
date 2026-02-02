# Task: Add Services to Search Results

## Overview
Include service information in the `/search` endpoint response so clients can see what capabilities agents have without fetching each detail.

## Current Behavior
- `/search` returns agents via `formatAgent()` which doesn't include services
- `/agents/:id` fetches and returns services separately
- Search results show `services: null` or omit entirely

## Requirements

### Option A: Include Service Summary (Recommended)
Add a lightweight service summary to search results:

```typescript
// In formatAgent(), add:
{
  // ... existing fields ...
  serviceCount: number,        // Total services
  serviceTypes: string[],      // ["MCP", "A2A", "web", "OASF"]
}
```

This keeps search responses small while showing capability info.

### Option B: Include Full Services
Join services table in search query. More data but potentially slower.

## Implementation

### File: `src/api/index.ts`

#### 1. Update Search Query
Add a subquery or join to get service info:

```typescript
// In /search endpoint, after fetching agents:
const agentIds = agents.map(a => a.id);

// Batch fetch service summaries
const serviceSummaries = await db
  .select({
    agentId: schema.agentService.agentId,
    serviceName: schema.agentService.serviceName,
  })
  .from(schema.agentService)
  .where(sql`${schema.agentService.agentId} IN (${sql.join(agentIds, sql`, `)})`);

// Group by agent
const servicesByAgent = new Map<string, string[]>();
for (const s of serviceSummaries) {
  const key = s.agentId.toString();
  if (!servicesByAgent.has(key)) servicesByAgent.set(key, []);
  servicesByAgent.get(key)!.push(s.serviceName);
}

// Add to results
return c.json({
  // ...
  results: agents.map(agent => ({
    ...formatAgent(agent),
    serviceTypes: servicesByAgent.get(agent.id.toString()) || [],
    serviceCount: (servicesByAgent.get(agent.id.toString()) || []).length,
  })),
});
```

#### 2. Alternative: Denormalize into Agent Table
Store service types directly on agent record during indexing:
- Add `serviceTypes: string[]` column
- Update during metadata enrichment
- Simpler queries, slightly stale data

## Testing

```bash
# Search should now include service info
curl "https://agents-api.b1ts.dev/search?limit=5" | jq '.results[] | {id, name, serviceTypes, serviceCount}'

# Expected output:
# { "id": "22717", "name": "CryptoAnalyst", "serviceTypes": ["MCP", "A2A", "OASF", "web"], "serviceCount": 4 }
```

## Success Criteria
- [ ] Search results include `serviceTypes` array
- [ ] Search results include `serviceCount` number
- [ ] No significant performance degradation
- [ ] Existing search functionality unchanged

## Self-Review Prompts
1. Is the join/subquery efficient for large result sets?
2. Should we add an index on `agentService.agentId`?
3. Are empty arrays handled correctly (agents with no services)?
4. Does this work with all existing filters (mcp, a2a, x402)?
5. Is the response format backward-compatible?
