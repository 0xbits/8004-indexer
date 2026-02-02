import schema from "ponder:schema";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface HealthCheckResult {
  status: HealthStatus;
  httpStatus?: number;
  latencyMs?: number;
  mcpValid?: boolean;
  a2aValid?: boolean;
  x402Price?: string;
  toolCount?: number;
  error?: string;
}

interface EndpointCandidate {
  url: string;
  kind: "mcp" | "a2a" | "web" | "unknown";
}

export function extractEndpoints(
  agent: typeof schema.agent.$inferSelect,
  services: Array<typeof schema.agentService.$inferSelect>
): EndpointCandidate[] {
  const endpoints: EndpointCandidate[] = [];
  for (const service of services) {
    if (!service.endpoint) continue;
    const name = (service.serviceName || "").toLowerCase();
    let kind: EndpointCandidate["kind"] = "unknown";
    if (name === "mcp") kind = "mcp";
    if (name === "a2a") kind = "a2a";
    if (name === "web" || name === "http") kind = "web";
    endpoints.push({ url: service.endpoint, kind });
  }

  if (endpoints.length === 0 && agent.agentURI) {
    endpoints.push({ url: agent.agentURI, kind: "unknown" });
  }

  const priority = { mcp: 0, a2a: 1, web: 2, unknown: 3 } as const;
  return endpoints.sort((a, b) => priority[a.kind] - priority[b.kind]);
}

function parseX402Price(headerValue: string | null): string | undefined {
  if (!headerValue) return undefined;
  const lower = headerValue.toLowerCase();
  if (!lower.includes("x402")) return undefined;
  const priceMatch = headerValue.match(/price=\"?([^\",;]+)\"?/i);
  if (priceMatch?.[1]) return priceMatch[1].trim();
  const amountMatch = headerValue.match(/amount=\"?([^\",;]+)\"?/i);
  if (amountMatch?.[1]) return amountMatch[1].trim();
  return "x402";
}

async function headOrGet(url: string): Promise<Response> {
  const headRes = await fetch(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(5000),
  });
  if (headRes.status !== 405 && headRes.status !== 501) return headRes;
  return fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchMcpTools(endpoint: string): Promise<string[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  if (!res.ok) {
    throw new Error(`MCP tools fetch failed: ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object") return [];

  const tools =
    (Array.isArray((data as any).tools) && (data as any).tools) ||
    (Array.isArray((data as any).result?.tools) && (data as any).result.tools) ||
    (Array.isArray((data as any).result) && (data as any).result) ||
    [];

  return tools
    .map((tool: any) => (typeof tool?.name === "string" ? tool.name : ""))
    .filter((name: string) => name.length > 0);
}

export function validateAgentCard(card: any): boolean {
  if (!card || typeof card !== "object") return false;
  if (typeof card.name !== "string" || card.name.trim().length === 0) return false;
  if (Array.isArray(card.services)) return true;
  if (typeof card.endpoint === "string" && card.endpoint.trim().length > 0) return true;
  return typeof card.description === "string" && card.description.trim().length > 0;
}

export async function checkAgentHealth(
  agent: typeof schema.agent.$inferSelect,
  services: Array<typeof schema.agentService.$inferSelect>
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = { status: "unknown" };
  const endpoints = extractEndpoints(agent, services);

  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      const res = await headOrGet(endpoint.url);
      result.httpStatus = res.status;
      result.latencyMs = Date.now() - start;
      result.x402Price = parseX402Price(res.headers.get("www-authenticate"));
      break;
    } catch (error: any) {
      result.error = error?.message || "Health ping failed";
    }
  }

  const mcpEndpoint = endpoints.find((e) => e.kind === "mcp")?.url;
  if (mcpEndpoint) {
    try {
      const tools = await fetchMcpTools(mcpEndpoint);
      result.mcpValid = tools.length > 0;
      result.toolCount = tools.length;
    } catch {
      result.mcpValid = false;
    }
  }

  const a2aEndpoint = endpoints.find((e) => e.kind === "a2a")?.url;
  if (a2aEndpoint) {
    try {
      const res = await fetch(a2aEndpoint, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const card = await res.json();
        result.a2aValid = validateAgentCard(card);
      } else {
        result.a2aValid = false;
      }
    } catch {
      result.a2aValid = false;
    }
  }

  if (result.httpStatus && result.httpStatus >= 200 && result.httpStatus < 400) {
    result.status = result.latencyMs && result.latencyMs > 3000 ? "degraded" : "healthy";
  } else if (result.httpStatus) {
    result.status = "degraded";
  } else {
    result.status = "down";
  }

  return result;
}
