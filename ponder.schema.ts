import { index, onchainTable, primaryKey, relations } from "ponder";

// ============================================
// IDENTITY REGISTRY - Registered Agents
// ============================================

export const agent = onchainTable("agent", (t) => ({
  // Primary key: agentId (tokenId from ERC-721)
  id: t.bigint().primaryKey(),
  
  // Owner address
  owner: t.hex().notNull(),
  
  // Agent URI (points to registration file)
  agentURI: t.text(),
  
  // Agent wallet for payments (optional, verified via EIP-712)
  agentWallet: t.hex(),
  
  // Registration timestamp
  registeredAt: t.bigint().notNull(),
  registeredBlock: t.bigint().notNull(),
  registeredTxHash: t.hex().notNull(),
  
  // Last update
  updatedAt: t.bigint(),
  
  // Parsed metadata from agentURI (if fetched)
  name: t.text(),
  description: t.text(),
  image: t.text(),
  active: t.boolean(),
  
  // Stats (computed)
  feedbackCount: t.integer().notNull().default(0),
  avgRating: t.real(),
}));

// Index for efficient lookups
export const agentOwnerIndex = index("agent_owner_idx").on(agent.owner);

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
    serviceName: t.text().notNull(), // e.g., "A2A", "MCP", "web", "ENS"
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
    // Composite key: agentId + clientAddress + feedbackIndex
    agentId: t.bigint().notNull(),
    clientAddress: t.hex().notNull(),
    feedbackIndex: t.bigint().notNull(),
    
    // Core feedback data
    value: t.bigint().notNull(), // int128 stored as bigint
    valueDecimals: t.integer().notNull(),
    
    // Optional tags for filtering
    tag1: t.text(),
    tag2: t.text(),
    
    // Optional endpoint being rated
    endpoint: t.text(),
    
    // Off-chain feedback details
    feedbackURI: t.text(),
    feedbackHash: t.hex(),
    
    // Status
    isRevoked: t.boolean().notNull().default(false),
    
    // Timestamps
    createdAt: t.bigint().notNull(),
    createdBlock: t.bigint().notNull(),
    createdTxHash: t.hex().notNull(),
    revokedAt: t.bigint(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.clientAddress, table.feedbackIndex] }),
  })
);

// Indexes for efficient queries
export const feedbackAgentIndex = index("feedback_agent_idx").on(feedback.agentId);
export const feedbackClientIndex = index("feedback_client_idx").on(feedback.clientAddress);
export const feedbackTag1Index = index("feedback_tag1_idx").on(feedback.tag1);

// ============================================
// TRANSFERS - Track ownership changes
// ============================================

export const transfer = onchainTable("transfer", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  agentId: t.bigint().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}));

// ============================================
// RELATIONS
// ============================================

export const agentRelations = relations(agent, ({ many }) => ({
  metadata: many(agentMetadata),
  services: many(agentService),
  feedbacks: many(feedback),
  transfers: many(transfer),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  agent: one(agent, {
    fields: [feedback.agentId],
    references: [agent.id],
  }),
}));

export const transferRelations = relations(transfer, ({ one }) => ({
  agent: one(agent, {
    fields: [transfer.agentId],
    references: [agent.id],
  }),
}));
