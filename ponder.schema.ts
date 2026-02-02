import { onchainTable, primaryKey } from "ponder";

// ============================================
// IDENTITY REGISTRY - Registered Agents
// ============================================

export const agent = onchainTable("agent", (t) => ({
  id: t.bigint().primaryKey(),
  owner: t.hex().notNull(),
  agentURI: t.text(),
  agentWallet: t.hex(),
  registeredAt: t.bigint().notNull(),
  registeredBlock: t.bigint().notNull(),
  registeredTxHash: t.hex().notNull(),
  updatedAt: t.bigint(),
  // Metadata from URI (enriched by worker)
  name: t.text(),
  description: t.text(),
  image: t.text(),
  active: t.boolean(),
  x402Support: t.boolean(),
  // Aggregated from services
  hasMCP: t.boolean(),
  hasA2A: t.boolean(),
  mcpTools: t.text(), // JSON array as text
  a2aSkills: t.text(), // JSON array as text
  // Feedback stats
  feedbackCount: t.integer().notNull().default(0),
  avgRating: t.real(),
  // Enrichment tracking
  metadataFetchedAt: t.bigint(),
  metadataError: t.text(),
}));

// ============================================
// AGENT METADATA - On-chain key-value metadata
// ============================================

export const agentMetadata = onchainTable(
  "agent_metadata",
  (t) => ({
    agentId: t.bigint().notNull(),
    metadataKey: t.text().notNull(),
    metadataValue: t.hex().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.metadataKey] }),
  })
);

// ============================================
// AGENT SERVICES - Endpoints from registration file
// ============================================

export const agentService = onchainTable(
  "agent_service",
  (t) => ({
    agentId: t.bigint().notNull(),
    serviceName: t.text().notNull(),
    endpoint: t.text().notNull(),
    version: t.text(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.serviceName] }),
  })
);

// ============================================
// REPUTATION REGISTRY - Feedback
// ============================================

export const feedback = onchainTable(
  "feedback",
  (t) => ({
    agentId: t.bigint().notNull(),
    clientAddress: t.hex().notNull(),
    feedbackIndex: t.bigint().notNull(),
    value: t.bigint().notNull(),
    valueDecimals: t.integer().notNull(),
    tag1: t.text(),
    tag2: t.text(),
    endpoint: t.text(),
    feedbackURI: t.text(),
    feedbackHash: t.hex(),
    isRevoked: t.boolean().notNull().default(false),
    createdAt: t.bigint().notNull(),
    createdBlock: t.bigint().notNull(),
    createdTxHash: t.hex().notNull(),
    revokedAt: t.bigint(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.clientAddress, table.feedbackIndex] }),
  })
);

// ============================================
// TRANSFERS - Track ownership changes
// ============================================

export const transfer = onchainTable("transfer", (t) => ({
  id: t.text().primaryKey(),
  agentId: t.bigint().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}));
