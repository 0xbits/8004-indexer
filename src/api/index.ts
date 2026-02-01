import { db } from "ponder:api";
import schema from "ponder:schema";
import { graphql } from "ponder";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { eq, desc, like, or, sql, count } from "ponder";

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
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
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

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Stats
app.get("/stats", async (c) => {
  try {
    const [agentCount] = await db.select({ count: count() }).from(schema.agent);
    const [feedbackCount] = await db.select({ count: count() }).from(schema.feedback);
    const [withUriCount] = await db
      .select({ count: count() })
      .from(schema.agent)
      .where(sql`${schema.agent.agentURI} IS NOT NULL AND ${schema.agent.agentURI} != ''`);
    
    return c.json({
      totalAgents: agentCount?.count || 0,
      totalFeedback: feedbackCount?.count || 0,
      agentsWithURI: withUriCount?.count || 0,
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
    
    let agents;
    if (query) {
      const searchPattern = `%${query.toLowerCase()}%`;
      agents = await db
        .select()
        .from(schema.agent)
        .where(
          or(
            sql`LOWER(${schema.agent.name}) LIKE ${searchPattern}`,
            sql`LOWER(${schema.agent.description}) LIKE ${searchPattern}`,
            sql`LOWER(${schema.agent.agentURI}) LIKE ${searchPattern}`
          )
        )
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
    
    // Get metadata
    const metadata = await db
      .select()
      .from(schema.agentMetadata)
      .where(eq(schema.agentMetadata.agentId, BigInt(id)));
    
    return c.json({
      ...formatAgent(agent),
      services: services.map((s) => ({
        name: s.serviceName,
        endpoint: s.endpoint,
        version: s.version,
      })),
      metadata: metadata.reduce((acc, m) => {
        acc[m.metadataKey] = m.metadataValue;
        return acc;
      }, {} as Record<string, string>),
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
// GRAPHQL
// ============================================

app.use("/graphql", graphql({ db, schema }));

// ============================================
// HELPERS
// ============================================

function formatAgent(agent: typeof schema.agent.$inferSelect) {
  return {
    id: agent.id.toString(),
    owner: agent.owner,
    uri: agent.agentURI,
    wallet: agent.agentWallet,
    name: agent.name,
    description: agent.description,
    image: agent.image,
    active: agent.active,
    feedbackCount: agent.feedbackCount,
    avgRating: agent.avgRating,
    registeredAt: agent.registeredAt.toString(),
    registeredBlock: agent.registeredBlock.toString(),
  };
}

export default app;
