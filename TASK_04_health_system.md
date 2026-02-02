# TASK: Agent Health Monitoring System

## Overview
Build a health monitoring system that actively checks agent endpoints and reports status, latency, and availability.

## Why
Anyone can register an agent with a dead URL. Health checks provide:
- Trust signal (is this agent actually working?)
- Quality metrics (response time, uptime)
- Discovery filter (show only healthy agents)

## Architecture

### New Database Table: `agent_health`
```sql
CREATE TABLE agent_health (
  id TEXT PRIMARY KEY,           -- agent ID
  status TEXT,                   -- 'healthy' | 'degraded' | 'down' | 'unknown'
  http_status INTEGER,           -- last HTTP status code
  latency_ms INTEGER,            -- response time in ms
  mcp_valid BOOLEAN,             -- MCP endpoint returns valid tools/list
  a2a_valid BOOLEAN,             -- agent-card.json is valid
  x402_price TEXT,               -- detected x402 price if any
  tool_count INTEGER,            -- actual tools from MCP introspection
  last_checked TIMESTAMP,        -- when we last checked
  last_healthy TIMESTAMP,        -- when it was last healthy
  check_count INTEGER,           -- total checks
  healthy_count INTEGER,         -- successful checks (for uptime calc)
  error_message TEXT             -- last error if any
);
```

### Health Check Logic

```typescript
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  httpStatus?: number;
  latencyMs?: number;
  mcpValid?: boolean;
  a2aValid?: boolean;
  x402Price?: string;
  toolCount?: number;
  error?: string;
}

async function checkAgentHealth(agent: Agent): Promise<HealthCheckResult> {
  const result: HealthCheckResult = { status: 'unknown' };
  
  // 1. Find primary endpoint (web, MCP, or A2A)
  const endpoints = extractEndpoints(agent);
  
  // 2. HTTP ping with timeout (5s)
  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      const res = await fetch(endpoint.url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      result.httpStatus = res.status;
      result.latencyMs = Date.now() - start;
      
      // Check x402 headers
      if (res.headers.get('www-authenticate')?.includes('x402')) {
        result.x402Price = parseX402Price(res.headers);
      }
    } catch (e) {
      result.error = e.message;
    }
  }
  
  // 3. MCP validation (if has MCP endpoint)
  if (agent.mcpEndpoint) {
    try {
      const tools = await fetchMcpTools(agent.mcpEndpoint);
      result.mcpValid = tools.length > 0;
      result.toolCount = tools.length;
    } catch {
      result.mcpValid = false;
    }
  }
  
  // 4. A2A validation (if has A2A endpoint)
  if (agent.a2aEndpoint) {
    try {
      const card = await fetch(agent.a2aEndpoint).then(r => r.json());
      result.a2aValid = validateAgentCard(card);
    } catch {
      result.a2aValid = false;
    }
  }
  
  // 5. Determine overall status
  if (result.httpStatus >= 200 && result.httpStatus < 400) {
    result.status = result.latencyMs > 3000 ? 'degraded' : 'healthy';
  } else if (result.httpStatus) {
    result.status = 'degraded';
  } else {
    result.status = 'down';
  }
  
  return result;
}
```

### Cron Job: Health Checker

Create a scheduled job that:
1. Runs every 6 hours (or configurable)
2. Samples agents (prioritize: has MCP/A2A, has feedback, recently registered)
3. Checks up to 100 agents per run (rate limiting)
4. Updates `agent_health` table
5. Logs results

```typescript
// src/jobs/health-checker.ts
export async function runHealthChecks() {
  // Get agents to check (prioritized)
  const agents = await getAgentsForHealthCheck(100);
  
  for (const agent of agents) {
    const result = await checkAgentHealth(agent);
    await upsertAgentHealth(agent.id, result);
    
    // Rate limit: 1 check per second
    await sleep(1000);
  }
}
```

### API Endpoints

#### `GET /agents/:id/health`
```json
{
  "agentId": "13445",
  "status": "healthy",
  "httpStatus": 200,
  "latencyMs": 245,
  "mcpValid": true,
  "toolCount": 6,
  "x402Price": "0.001 ETH",
  "lastChecked": "2024-02-02T12:00:00Z",
  "uptime": 98.5
}
```

#### `GET /health/stats`
```json
{
  "totalChecked": 1500,
  "healthy": 1200,
  "degraded": 150,
  "down": 100,
  "unknown": 50,
  "avgLatencyMs": 450,
  "lastRun": "2024-02-02T12:00:00Z"
}
```

#### Enhanced: `GET /search`
Add `status` filter:
```
GET /search?status=healthy
GET /search?mcp=true&status=healthy
```

### Frontend Changes

#### Status Badge on Agent Cards
Show colored dot/badge:
- 🟢 Healthy (green)
- 🟡 Degraded (yellow)  
- 🔴 Down (red)
- ⚪ Unknown (gray)

#### Agent Detail Health Section
```
Health Status
┌─────────────────────────────────────┐
│ Status: 🟢 Healthy                  │
│ Response Time: 245ms                │
│ Uptime: 98.5% (last 30 days)        │
│ Last Checked: 2 hours ago           │
│ MCP: ✓ Valid (6 tools)              │
│ A2A: ✓ Valid                        │
│ x402 Price: 0.001 ETH per call      │
└─────────────────────────────────────┘
```

#### Filter by Status
Add status filter toggle: `[Healthy only]`

## Implementation Priority

1. **Database schema** — Add health table
2. **Health check function** — Core logic
3. **API endpoints** — `/health` routes
4. **Cron job** — Scheduled checker (can use Ponder's cron or external)
5. **Frontend badges** — Status indicators
6. **Frontend detail** — Health section
7. **Search filter** — Status param

## Files to Create/Modify

### Indexer (8004-indexer)
- `ponder.schema.ts` — Add health table
- `src/api/health.ts` — Health check logic
- `src/api/index.ts` — Add health endpoints
- `src/jobs/health-checker.ts` — Cron job

### Frontend (8004-app)
- `src/lib/api.ts` — Add health API functions
- `src/components/StatusBadge.tsx` — Status indicator
- `src/components/AgentCard.tsx` — Add status badge
- `src/components/AgentDetail/HealthSection.tsx` — Health details
- `src/app/agents/[id]/page.tsx` — Add health section

## Acceptance Criteria
- [ ] Health table stores check results
- [ ] Health check function works for HTTP/MCP/A2A
- [ ] `/agents/:id/health` returns status
- [ ] Status badges show on agent cards
- [ ] Agent detail shows health section
- [ ] Cron job runs periodically

## DO NOT
- Check all 20K agents at once (sample + prioritize)
- Store raw response bodies
- Make health checks blocking for page loads
- Overload agent endpoints (1 req/sec max)
