import { ponder } from "ponder:registry";
import { agent, agentMetadata, agentService, transfer } from "ponder:schema";

// ============================================
// METADATA FETCHING
// ============================================

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

interface ParsedMetadata {
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
  services?: {
    name: string;
    endpoint: string;
    version?: string;
    description?: string;
    capabilities?: string[];
    tools?: string[];
    skills?: string[];
  }[];
}

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

async function fetchAndParseURI(uri: string | null): Promise<ParsedMetadata | null> {
  if (!uri) return null;
  
  try {
    let content: string;
    
    if (uri.startsWith("data:")) {
      const match = uri.match(/^data:([^,;]+)?(;base64)?,(.*)$/);
      if (!match) return null;
      const [, , isBase64, data] = match;
      content = isBase64 ? Buffer.from(data, "base64").toString("utf-8") : decodeURIComponent(data);
    } else if (uri.startsWith("ipfs://")) {
      const cid = uri.replace("ipfs://", "");
      let fetched = false;
      for (const gateway of IPFS_GATEWAYS) {
        try {
          const res = await fetch(`${gateway}${cid}`, { 
            signal: AbortSignal.timeout(5000),
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
      const res = await fetch(uri, { 
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/json", "User-Agent": "ERC8004-Indexer/1.0" }
      });
      if (!res.ok) return null;
      content = await res.text();
    } else {
      return null;
    }
    
    const data = JSON.parse(content!);
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
      name: typeof data.name === "string" ? data.name.slice(0, 500) : undefined,
      description: typeof data.description === "string" ? data.description.slice(0, 2000) : undefined,
      image: typeof data.image === "string" ? data.image.slice(0, 500) : undefined,
      externalUrl: typeof data.external_url === "string" ? data.external_url.slice(0, 500) : undefined,
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
      services: services.map((s: any) => ({
        name: s.name || "unknown",
        endpoint: s.endpoint || "",
        version: s.version,
        description: typeof s.description === "string" ? s.description.slice(0, 1000) : undefined,
        capabilities: normalizeStringArray(s.capabilities),
        tools: normalizeStringArray(s.tools),
        skills: normalizeStringArray(s.a2aSkills ?? s.skills),
      })),
    };
  } catch (e) {
    // Silently fail - metadata is best-effort
    return null;
  }
}

// ============================================
// IDENTITY REGISTRY INDEXING
// ============================================

/**
 * Handle new agent registration
 */
ponder.on("IdentityRegistry:Registered", async ({ event, context }) => {
  const { agentId, agentURI, owner } = event.args;
  
  // Fetch and parse metadata from URI
  const metadata = await fetchAndParseURI(agentURI || null);
  
  await context.db.insert(agent).values({
    id: agentId,
    owner: owner,
    agentURI: agentURI || null,
    registeredAt: event.block.timestamp,
    registeredBlock: event.block.number,
    registeredTxHash: event.transaction.hash,
    feedbackCount: 0,
    // Metadata from URI
    name: metadata?.name || null,
    description: metadata?.description || null,
    image: metadata?.image || null,
    externalUrl: metadata?.externalUrl || null,
    active: metadata?.active ?? null,
    x402Support: metadata?.x402Support ?? false,
    tags: metadata?.tags ? JSON.stringify(metadata.tags) : null,
    protocols: metadata?.protocols ? JSON.stringify(metadata.protocols) : null,
    chain: metadata?.chain || null,
    chainId: metadata?.chainId ?? null,
    supportedTrust: metadata?.supportedTrust ? JSON.stringify(metadata.supportedTrust) : null,
    mcpCapabilities: metadata?.mcpCapabilities ? JSON.stringify(metadata.mcpCapabilities) : null,
    hasMCP: metadata?.hasMCP ?? false,
    hasA2A: metadata?.hasA2A ?? false,
    mcpTools: metadata?.mcpTools ? JSON.stringify(metadata.mcpTools) : null,
    a2aSkills: metadata?.a2aSkills ? JSON.stringify(metadata.a2aSkills) : null,
    metadataFetchedAt: metadata ? event.block.timestamp : null,
    metadataUpdatedAt: metadata?.metadataUpdatedAt ?? null,
  });
  
  // Insert services
  if (metadata?.services) {
    for (const svc of metadata.services) {
      await context.db.insert(agentService).values({
        agentId: agentId,
        serviceName: svc.name,
        endpoint: svc.endpoint,
        version: svc.version || null,
        description: svc.description || null,
        capabilities: svc.capabilities ? JSON.stringify(svc.capabilities) : null,
        tools: svc.tools ? JSON.stringify(svc.tools) : null,
        skills: svc.skills ? JSON.stringify(svc.skills) : null,
      }).onConflictDoNothing();
    }
  }
  
  console.log(`📝 Agent #${agentId}: ${metadata?.name || "(no metadata)"}`);
});

/**
 * Handle ERC-721 transfers (ownership changes)
 */
ponder.on("IdentityRegistry:Transfer", async ({ event, context }) => {
  const { from, to, tokenId: agentId } = event.args;
  
  // Skip mint events (from = 0x0) - handled by Registered event
  if (from === "0x0000000000000000000000000000000000000000") {
    return;
  }
  
  // Record the transfer
  await context.db.insert(transfer).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agentId: agentId,
    from: from,
    to: to,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
  
  // Update agent owner
  await context.db
    .update(agent, { id: agentId })
    .set({
      owner: to,
      agentWallet: null, // Reset wallet on transfer per spec
      updatedAt: event.block.timestamp,
    });
  
  console.log(`🔄 Agent #${agentId} transferred: ${from} → ${to}`);
});

/**
 * Handle URI updates
 */
ponder.on("IdentityRegistry:URIUpdated", async ({ event, context }) => {
  const { agentId, newURI } = event.args;
  
  // Fetch and parse new metadata
  const metadata = await fetchAndParseURI(newURI || null);
  
  await context.db
    .update(agent, { id: agentId })
    .set({
      agentURI: newURI,
      updatedAt: event.block.timestamp,
      // Update metadata
      name: metadata?.name || null,
      description: metadata?.description || null,
      image: metadata?.image || null,
      externalUrl: metadata?.externalUrl || null,
      active: metadata?.active ?? null,
      x402Support: metadata?.x402Support ?? false,
      tags: metadata?.tags ? JSON.stringify(metadata.tags) : null,
      protocols: metadata?.protocols ? JSON.stringify(metadata.protocols) : null,
      chain: metadata?.chain || null,
      chainId: metadata?.chainId ?? null,
      supportedTrust: metadata?.supportedTrust ? JSON.stringify(metadata.supportedTrust) : null,
      mcpCapabilities: metadata?.mcpCapabilities ? JSON.stringify(metadata.mcpCapabilities) : null,
      hasMCP: metadata?.hasMCP ?? false,
      hasA2A: metadata?.hasA2A ?? false,
      mcpTools: metadata?.mcpTools ? JSON.stringify(metadata.mcpTools) : null,
      a2aSkills: metadata?.a2aSkills ? JSON.stringify(metadata.a2aSkills) : null,
      metadataFetchedAt: metadata ? event.block.timestamp : null,
      metadataUpdatedAt: metadata?.metadataUpdatedAt ?? null,
      metadataError: null,
    });
  
  // Update services - delete old and insert new
  if (metadata?.services) {
    // Insert/update services
    for (const svc of metadata.services) {
      await context.db.insert(agentService).values({
        agentId: agentId,
        serviceName: svc.name,
        endpoint: svc.endpoint,
        version: svc.version || null,
        description: svc.description || null,
        capabilities: svc.capabilities ? JSON.stringify(svc.capabilities) : null,
        tools: svc.tools ? JSON.stringify(svc.tools) : null,
        skills: svc.skills ? JSON.stringify(svc.skills) : null,
      }).onConflictDoUpdate({
        endpoint: svc.endpoint,
        version: svc.version || null,
        description: svc.description || null,
        capabilities: svc.capabilities ? JSON.stringify(svc.capabilities) : null,
        tools: svc.tools ? JSON.stringify(svc.tools) : null,
        skills: svc.skills ? JSON.stringify(svc.skills) : null,
      });
    }
  }
  
  console.log(`🔗 Agent #${agentId} URI updated: ${metadata?.name || "(no metadata)"}`);
});

/**
 * Handle metadata updates
 */
ponder.on("IdentityRegistry:MetadataSet", async ({ event, context }) => {
  const { agentId, metadataKey, metadataValue } = event.args;
  
  // Upsert metadata
  await context.db
    .insert(agentMetadata)
    .values({
      agentId: agentId,
      metadataKey: metadataKey,
      metadataValue: metadataValue,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      metadataValue: metadataValue,
      updatedAt: event.block.timestamp,
    });
  
  // Special handling for agentWallet
  if (metadataKey === "agentWallet") {
    // Decode the address from bytes
    const walletAddress = `0x${metadataValue.slice(26)}` as `0x${string}`;
    await context.db
      .update(agent, { id: agentId })
      .set({
        agentWallet: walletAddress,
        updatedAt: event.block.timestamp,
      });
  }
  
  console.log(`📋 Agent #${agentId} metadata updated: ${metadataKey}`);
});
