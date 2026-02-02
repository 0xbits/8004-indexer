import { db } from "ponder:api";
import schema from "ponder:schema";
import { graphql } from "ponder";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { eq, desc, like, or, sql, count } from "ponder";

// ============================================
// METADATA FETCHING (inline for API use)
// ============================================

interface AgentMetadataResult {
  name?: string;
  description?: string;
  image?: string;
  externalUrl?: string;
  active?: boolean;
  x402Support?: boolean;
  tags?: string[];
  protocols?: string[];
  chain?: string;
  chainId?: number;
  supportedTrust?: string[];
  mcpCapabilities?: string[];
  hasMCP?: boolean;
  hasA2A?: boolean;
  mcpTools?: string[];
  a2aSkills?: string[];
  metadataUpdatedAt?: bigint;
}

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

function parseMetadataUpdatedAt(value: unknown): bigint | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const seconds = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
    return BigInt(seconds);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      const seconds = asNumber > 1e12 ? Math.floor(asNumber / 1000) : Math.floor(asNumber);
      return BigInt(seconds);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return BigInt(Math.floor(parsed / 1000));
    }
  }
  return undefined;
}

async function fetchAndParseMetadata(uri: string): Promise<AgentMetadataResult | null> {
  try {
    let content: string;
    
    if (uri.startsWith("data:")) {
      // Decode data URI
      const match = uri.match(/^data:([^,;]+)?(;base64)?,(.*)$/);
      if (!match) return null;
      const [, , isBase64, data] = match;
      content = isBase64 ? Buffer.from(data, "base64").toString("utf-8") : decodeURIComponent(data);
    } else if (uri.startsWith("ipfs://")) {
      // Fetch from IPFS gateway
      const cid = uri.replace("ipfs://", "");
      let fetched = false;
      for (const gateway of IPFS_GATEWAYS) {
        try {
          const res = await fetch(`${gateway}${cid}`, { 
            signal: AbortSignal.timeout(8000),
            headers: { "Accept": "application/json" }
          });
          if (res.ok) {
            content = await res.text();
            fetched = true;
            break;
          }
        } catch {}
      }
      if (!fetched) return null;
    } else if (uri.startsWith("http")) {
      // Fetch from HTTP
      const res = await fetch(uri, { 
        signal: AbortSignal.timeout(8000),
        headers: { "Accept": "application/json", "User-Agent": "ERC8004-Indexer/1.0" }
      });
      if (!res.ok) return null;
      content = await res.text();
    } else {
      return null;
    }
    
    const data = JSON.parse(content!);
    
    // Extract service info
    const services = Array.isArray(data.services) ? data.services : [];
    const hasMCP = services.some((s: any) => s.name?.toLowerCase() === "mcp");
    const hasA2A = services.some((s: any) => s.name?.toLowerCase() === "a2a");
    
    const mcpTools: string[] = [];
    const a2aSkills: string[] = [];
    const mcpCapabilities: string[] = [];
    for (const svc of services) {
      if (Array.isArray(svc.tools)) mcpTools.push(...svc.tools);
      if (Array.isArray(svc.a2aSkills)) a2aSkills.push(...svc.a2aSkills);
      if (Array.isArray(svc.skills)) a2aSkills.push(...svc.skills);
      if (Array.isArray(svc.capabilities)) mcpCapabilities.push(...svc.capabilities);
    }
    
    const tags = normalizeStringArray(data?.attributes?.tags);
    const protocols = normalizeStringArray(data?.attributes?.protocols);
    const supportedTrust = normalizeStringArray(data?.supportedTrust);
    const metadataUpdatedAt = parseMetadataUpdatedAt(
      data?.updatedAt ?? data?.updated_at ?? data?.metadataUpdatedAt
    );
    const chain = typeof data?.attributes?.blockchain?.chain === "string"
      ? data.attributes.blockchain.chain
      : undefined;
    const chainId =
      typeof data?.attributes?.blockchain?.chainId === "number"
        ? data.attributes.blockchain.chainId
        : typeof data?.attributes?.blockchain?.chainId === "string"
          ? Number(data.attributes.blockchain.chainId)
          : undefined;

    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      image: typeof data.image === "string" ? data.image : undefined,
      externalUrl: typeof data.external_url === "string" ? data.external_url : undefined,
      active: typeof data.active === "boolean" ? data.active : undefined,
      x402Support: data.x402Support === true || data.x402support === true,
      tags,
      protocols,
      chain: chain ? chain.slice(0, 100) : undefined,
      chainId: Number.isFinite(chainId) ? chainId : undefined,
      supportedTrust,
      mcpCapabilities: mcpCapabilities.length > 0 ? mcpCapabilities : undefined,
      hasMCP,
      hasA2A,
      mcpTools: mcpTools.length > 0 ? mcpTools : undefined,
      a2aSkills: a2aSkills.length > 0 ? a2aSkills : undefined,
      metadataUpdatedAt,
    };
  } catch {
    return null;
  }
}

const app = new Hono();

// ============================================
// MIDDLEWARE
// ============================================

// CORS
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  const now = Date.now();
  
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  
  entry.count++;
  
  c.res.headers.set("X-RateLimit-Limit", RATE_LIMIT.toString());
  c.res.headers.set("X-RateLimit-Remaining", Math.max(0, RATE_LIMIT - entry.count).toString());
  c.res.headers.set("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());
  
  if (entry.count > RATE_LIMIT) {
    return c.json({ error: "Rate limit exceeded", retryAfter: Math.ceil((entry.resetAt - now) / 1000) }, 429);
  }
  
  await next();
});

// ============================================
// API DOCUMENTATION
// ============================================

const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "ERC-8004 Agents API",
    version: "1.0.0",
    description: "API for discovering ERC-8004 Trustless Agents on Ethereum",
    contact: {
      name: "Bits",
      url: "https://b1ts.dev",
    },
  },
  servers: [
    { url: "https://api.agents.b1ts.dev", description: "Production" },
    { url: "http://localhost:42069", description: "Development" },
  ],
  paths: {
    "/stats": {
      get: {
        summary: "Get registry statistics",
        responses: {
          "200": {
            description: "Registry stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    totalAgents: { type: "integer" },
                    totalFeedback: { type: "integer" },
                    agentsWithURI: { type: "integer" },
                    chainBreakdown: { type: "object" },
                    topTags: { type: "array", items: { type: "object" } },
                    topProtocols: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/search": {
      get: {
        summary: "Search agents",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search query" },
          { name: "chain", in: "query", schema: { type: "string" }, description: "Filter by chain" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag" },
          { name: "protocol", in: "query", schema: { type: "string" }, description: "Filter by protocol" },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["rating", "feedback", "recent"] } },
        ],
        responses: {
          "200": { description: "Search results" },
        },
      },
    },
    "/agents/{id}": {
      get: {
        summary: "Get agent by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Agent details" },
          "404": { description: "Agent not found" },
        },
      },
    },
    "/agents/{id}/feedback": {
      get: {
        summary: "Get feedback for an agent",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": { description: "Feedback list" },
        },
      },
    },
    "/graphql": {
      post: {
        summary: "GraphQL endpoint",
        description: "Full GraphQL API for complex queries",
        responses: {
          "200": { description: "GraphQL response" },
        },
      },
    },
  },
};

// OpenAPI spec endpoint
app.get("/openapi.json", (c) => c.json(openApiSpec));

// Swagger UI
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// ============================================
// REST ENDPOINTS
// ============================================

// Stats
app.get("/stats", async (c) => {
  try {
    const [agentCount] = await db.select({ count: count() }).from(schema.agent);
    const [feedbackCount] = await db.select({ count: count() }).from(schema.feedback);
    const [withUriCount] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.agentURI} IS NOT NULL AND ${schema.agent.agentURI} != ''`);
    const [withMetadataCount] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.metadataFetchedAt} IS NOT NULL AND ${schema.agent.name} IS NOT NULL`);
    const [withMCPCount] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.hasMCP} = true`);
    const [withA2ACount] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.hasA2A} = true`);
    const [withX402Count] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.x402Support} = true`);

    const agentsForStats = await db
      .select({ chain: schema.agent.chain, tags: schema.agent.tags, protocols: schema.agent.protocols })
      .from(schema.agent);

    const chainCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const protocolCounts = new Map<string, number>();

    for (const row of agentsForStats) {
      if (row.chain && row.chain.trim()) {
        const key = row.chain.trim().toLowerCase();
        chainCounts.set(key, (chainCounts.get(key) || 0) + 1);
      }

      const tags = parseJsonArray(row.tags);
      if (tags) {
        for (const tag of tags) {
          const key = tag.trim().toLowerCase();
          if (!key) continue;
          tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
        }
      }

      const protocols = parseJsonArray(row.protocols);
      if (protocols) {
        for (const protocol of protocols) {
          const key = protocol.trim().toLowerCase();
          if (!key) continue;
          protocolCounts.set(key, (protocolCounts.get(key) || 0) + 1);
        }
      }
    }

    const chainBreakdown = Object.fromEntries(chainCounts.entries());
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    const topProtocols = [...protocolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([protocol, count]) => ({ protocol, count }));
    
    return c.json({
      totalAgents: agentCount?.count || 0,
      totalFeedback: feedbackCount?.count || 0,
      agentsWithURI: withUriCount?.count || 0,
      agentsWithMetadata: withMetadataCount?.count || 0,
      agentsWithMCP: withMCPCount?.count || 0,
      agentsWithA2A: withA2ACount?.count || 0,
      agentsWithX402: withX402Count?.count || 0,
      chainBreakdown,
      topTags,
      topProtocols,
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

// Search agents
app.get("/search", async (c) => {
  const query = c.req.query("q") || "";
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const sort = c.req.query("sort") || "feedback";
  const hasMCP = c.req.query("mcp") === "true";
  const hasA2A = c.req.query("a2a") === "true";
  const hasX402 = c.req.query("x402") === "true";
  const hasMetadata = c.req.query("metadata") === "true";
  const chain = c.req.query("chain")?.trim();
  const tag = c.req.query("tag")?.trim();
  const protocol = c.req.query("protocol")?.trim();
  
  try {
    let orderBy;
    switch (sort) {
      case "rating":
        orderBy = desc(schema.agent.avgRating);
        break;
      case "recent":
        orderBy = desc(schema.agent.registeredAt);
        break;
      case "feedback":
      default:
        orderBy = desc(schema.agent.feedbackCount);
    }
    
    // Build filter conditions
    const conditions = [];
    
    if (query) {
      const searchPattern = `%${query.toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${schema.agent.name}) LIKE ${searchPattern}`,
          sql`LOWER(${schema.agent.description}) LIKE ${searchPattern}`,
          sql`LOWER(${schema.agent.mcpTools}) LIKE ${searchPattern}`,
          sql`LOWER(${schema.agent.a2aSkills}) LIKE ${searchPattern}`,
          sql`LOWER(${schema.agent.agentURI}) LIKE ${searchPattern}`
        )
      );
    }
    
    if (hasMCP) conditions.push(sql`${schema.agent.hasMCP} = true`);
    if (hasA2A) conditions.push(sql`${schema.agent.hasA2A} = true`);
    if (hasX402) conditions.push(sql`${schema.agent.x402Support} = true`);
    if (hasMetadata) conditions.push(sql`${schema.agent.name} IS NOT NULL`);
    if (chain) conditions.push(sql`LOWER(${schema.agent.chain}) = ${chain.toLowerCase()}`);
    if (tag) {
      const tagPattern = `%\"${tag.toLowerCase()}\"%`;
      conditions.push(sql`LOWER(${schema.agent.tags}) LIKE ${tagPattern}`);
    }
    if (protocol) {
      const protocolPattern = `%\"${protocol.toLowerCase()}\"%`;
      conditions.push(sql`LOWER(${schema.agent.protocols}) LIKE ${protocolPattern}`);
    }
    
    let agents;
    if (conditions.length > 0) {
      agents = await db
        .select()
        .from(schema.agent)
        .where(sql.join(conditions, sql` AND `))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    } else {
      agents = await db
        .select()
        .from(schema.agent)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    }
    
    return c.json({
      query,
      count: agents.length,
      offset,
      limit,
      results: agents.map(formatAgent),
    });
  } catch (error) {
    console.error("Search error:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

// Get agent by ID
app.get("/agents/:id", async (c) => {
  const id = c.req.param("id");
  
  try {
    const [agent] = await db
      .select()
      .from(schema.agent)
      .where(eq(schema.agent.id, BigInt(id)));
    
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }
    
    // Get services
    const services = await db
      .select()
      .from(schema.agentService)
      .where(eq(schema.agentService.agentId, BigInt(id)));
    
    return c.json({
      ...formatAgent(agent),
      services: services.map((s) => ({
        name: s.serviceName,
        endpoint: s.endpoint,
        version: s.version,
        description: s.description,
        capabilities: parseJsonArray(s.capabilities),
        tools: parseJsonArray(s.tools),
        skills: parseJsonArray(s.skills),
      })),
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch agent" }, 500);
  }
});

// Get agent feedback
app.get("/agents/:id/feedback", async (c) => {
  const id = c.req.param("id");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  
  try {
    const feedbackList = await db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.agentId, BigInt(id)))
      .orderBy(desc(schema.feedback.createdAt))
      .limit(limit);
    
    return c.json({
      agentId: id,
      count: feedbackList.length,
      feedback: feedbackList.map((f) => ({
        client: f.clientAddress,
        value: f.value.toString(),
        valueDecimals: f.valueDecimals,
        rating: Number(f.value) / Math.pow(10, f.valueDecimals),
        tags: [f.tag1, f.tag2].filter(Boolean),
        endpoint: f.endpoint,
        feedbackURI: f.feedbackURI,
        isRevoked: f.isRevoked,
        createdAt: f.createdAt.toString(),
      })),
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch feedback" }, 500);
  }
});

// Top agents endpoint
app.get("/top", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);
  const by = c.req.query("by") || "feedback";
  
  try {
    let orderBy;
    switch (by) {
      case "rating":
        orderBy = desc(schema.agent.avgRating);
        break;
      case "feedback":
      default:
        orderBy = desc(schema.agent.feedbackCount);
    }
    
    const agents = await db
      .select()
      .from(schema.agent)
      .where(sql`${schema.agent.feedbackCount} > 0`)
      .orderBy(orderBy)
      .limit(limit);
    
    return c.json({
      by,
      count: agents.length,
      agents: agents.map(formatAgent),
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch top agents" }, 500);
  }
});

// ============================================
// ENRICHMENT STATUS
// ============================================

// Trigger enrichment for a batch of agents
app.post("/enrichment/run", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
  const secret = c.req.header("X-Enrich-Secret");
  
  // Simple protection - can be improved
  if (process.env.ENRICH_SECRET && secret !== process.env.ENRICH_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  try {
    // Get agents needing enrichment (have URI but no metadata fetched)
    const agents = await db
      .select({ id: schema.agent.id, uri: schema.agent.agentURI })
      .from(schema.agent)
      .where(sql`
        ${schema.agent.agentURI} IS NOT NULL 
        AND ${schema.agent.metadataFetchedAt} IS NULL
      `)
      .orderBy(desc(schema.agent.feedbackCount))
      .limit(limit);
    
    const results = { processed: 0, success: 0, failed: 0, agents: [] as any[] };
    
    for (const agent of agents) {
      if (!agent.uri) continue;
      results.processed++;
      
      const metadata = await fetchAndParseMetadata(agent.uri);
      const now = BigInt(Math.floor(Date.now() / 1000));
      
      if (metadata && (metadata.name || metadata.description)) {
        await db
          .update(schema.agent, { id: agent.id })
          .set({
            name: metadata.name || null,
            description: metadata.description || null,
            image: metadata.image || null,
            externalUrl: metadata.externalUrl || null,
            active: metadata.active ?? null,
            x402Support: metadata.x402Support ?? false,
            tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
            protocols: metadata.protocols ? JSON.stringify(metadata.protocols) : null,
            chain: metadata.chain || null,
            chainId: metadata.chainId ?? null,
            supportedTrust: metadata.supportedTrust ? JSON.stringify(metadata.supportedTrust) : null,
            mcpCapabilities: metadata.mcpCapabilities ? JSON.stringify(metadata.mcpCapabilities) : null,
            hasMCP: metadata.hasMCP ?? false,
            hasA2A: metadata.hasA2A ?? false,
            mcpTools: metadata.mcpTools ? JSON.stringify(metadata.mcpTools) : null,
            a2aSkills: metadata.a2aSkills ? JSON.stringify(metadata.a2aSkills) : null,
            metadataFetchedAt: now,
            metadataUpdatedAt: metadata.metadataUpdatedAt ?? null,
            metadataError: null,
          });
        results.success++;
        results.agents.push({ id: agent.id.toString(), name: metadata.name, status: "ok" });
      } else {
        await db
          .update(schema.agent, { id: agent.id })
          .set({
            metadataFetchedAt: now,
            metadataError: "No valid metadata",
          });
        results.failed++;
        results.agents.push({ id: agent.id.toString(), status: "no_metadata" });
      }
      
      // Small delay to be nice
      await new Promise(r => setTimeout(r, 50));
    }
    
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message || "Enrichment failed" }, 500);
  }
});

// Get enrichment status
app.get("/enrichment/status", async (c) => {
  try {
    const [total] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.agentURI} IS NOT NULL`);
    
    const [enriched] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.metadataFetchedAt} IS NOT NULL`);
    
    const [withName] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.name} IS NOT NULL`);
    
    const [failed] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.metadataError} IS NOT NULL`);
    
    return c.json({
      total: total?.count || 0,
      enriched: enriched?.count || 0,
      withName: withName?.count || 0,
      failed: failed?.count || 0,
      pending: (total?.count || 0) - (enriched?.count || 0),
    });
  } catch (error) {
    return c.json({ error: "Failed to get enrichment status" }, 500);
  }
});

// ============================================
// GRAPHQL
// ============================================

app.use("/graphql", graphql({ db, schema }));

// ============================================
// HELPERS
// ============================================

function parseJsonArray(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item) => typeof item === "string");
  } catch {
    return null;
  }
}

function formatAgent(agent: typeof schema.agent.$inferSelect) {
  return {
    id: agent.id.toString(),
    owner: agent.owner,
    uri: agent.agentURI,
    wallet: agent.agentWallet,
    name: agent.name,
    description: agent.description,
    image: agent.image,
    externalUrl: agent.externalUrl,
    active: agent.active,
    x402Support: agent.x402Support,
    tags: parseJsonArray(agent.tags),
    protocols: parseJsonArray(agent.protocols),
    chain: agent.chain,
    chainId: agent.chainId,
    supportedTrust: parseJsonArray(agent.supportedTrust),
    mcpCapabilities: parseJsonArray(agent.mcpCapabilities),
    hasMCP: agent.hasMCP,
    hasA2A: agent.hasA2A,
    mcpTools: parseJsonArray(agent.mcpTools),
    a2aSkills: parseJsonArray(agent.a2aSkills),
    feedbackCount: agent.feedbackCount,
    avgRating: agent.avgRating,
    registeredAt: agent.registeredAt.toString(),
    registeredBlock: agent.registeredBlock.toString(),
    metadataFetched: agent.metadataFetchedAt != null,
    metadataUpdatedAt: agent.metadataUpdatedAt ? agent.metadataUpdatedAt.toString() : null,
  };
}

export default app;
