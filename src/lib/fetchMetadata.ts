/**
 * Fetch and parse ERC-8004 agent metadata from URIs
 */

export interface AgentMetadata {
  name?: string;
  description?: string;
  image?: string;
  active?: boolean;
  x402Support?: boolean;
  services?: ServiceInfo[];
  supportedTrust?: string[];
  registrations?: any[];
}

export interface ServiceInfo {
  name: string;
  endpoint: string;
  version?: string;
  description?: string;
  mcpTools?: string[];
  a2aSkills?: string[];
  capabilities?: string[];
}

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch metadata from a URI (HTTP, IPFS, or data: URI)
 */
export async function fetchAgentMetadata(uri: string | null): Promise<AgentMetadata | null> {
  if (!uri) return null;
  
  try {
    let content: string;
    
    if (uri.startsWith("data:")) {
      content = decodeDataUri(uri);
    } else if (uri.startsWith("ipfs://")) {
      content = await fetchFromIPFS(uri);
    } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
      content = await fetchFromHTTP(uri);
    } else {
      console.warn(`Unknown URI scheme: ${uri.slice(0, 50)}`);
      return null;
    }
    
    return parseMetadata(content);
  } catch (error) {
    console.error(`Failed to fetch metadata from ${uri.slice(0, 100)}:`, error);
    return null;
  }
}

/**
 * Decode data: URI (base64 or plain JSON)
 */
function decodeDataUri(uri: string): string {
  // data:application/json;base64,eyJ...
  // data:application/json,{...}
  
  const match = uri.match(/^data:([^,;]+)?(;base64)?,(.*)$/);
  if (!match) {
    throw new Error("Invalid data URI format");
  }
  
  const [, , isBase64, data] = match;
  
  if (isBase64) {
    return Buffer.from(data, "base64").toString("utf-8");
  }
  return decodeURIComponent(data);
}

/**
 * Fetch from IPFS using gateway fallback
 */
async function fetchFromIPFS(uri: string): Promise<string> {
  const cid = uri.replace("ipfs://", "");
  
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const response = await fetchWithTimeout(`${gateway}${cid}`);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Try next gateway
    }
  }
  
  throw new Error(`Failed to fetch from IPFS: ${cid}`);
}

/**
 * Fetch from HTTP/HTTPS
 */
async function fetchFromHTTP(uri: string): Promise<string> {
  const response = await fetchWithTimeout(uri);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "ERC8004-Indexer/1.0",
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse metadata JSON with validation
 */
function parseMetadata(content: string): AgentMetadata {
  const data = JSON.parse(content);
  
  return {
    name: typeof data.name === "string" ? data.name : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
    image: typeof data.image === "string" ? data.image : undefined,
    active: typeof data.active === "boolean" ? data.active : undefined,
    x402Support: data.x402Support === true || data.x402support === true,
    services: Array.isArray(data.services) ? data.services.map(parseService) : undefined,
    supportedTrust: Array.isArray(data.supportedTrust) ? data.supportedTrust : undefined,
    registrations: Array.isArray(data.registrations) ? data.registrations : undefined,
  };
}

/**
 * Parse service entry
 */
function parseService(svc: any): ServiceInfo {
  return {
    name: svc.name || "unknown",
    endpoint: svc.endpoint || "",
    version: svc.version,
    description: svc.description,
    mcpTools: Array.isArray(svc.mcpTools) ? svc.mcpTools : undefined,
    a2aSkills: Array.isArray(svc.a2aSkills) ? svc.a2aSkills : undefined,
    capabilities: Array.isArray(svc.capabilities) ? svc.capabilities : undefined,
  };
}
