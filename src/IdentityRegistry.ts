import { ponder } from "ponder:registry";
import { agent, agentMetadata, transfer } from "ponder:schema";

// ============================================
// IDENTITY REGISTRY INDEXING
// ============================================

/**
 * Handle new agent registration
 */
ponder.on("IdentityRegistry:Registered", async ({ event, context }) => {
  const { agentId, agentURI, owner } = event.args;
  
  await context.db.insert(agent).values({
    id: agentId,
    owner: owner,
    agentURI: agentURI || null,
    registeredAt: event.block.timestamp,
    registeredBlock: event.block.number,
    registeredTxHash: event.transaction.hash,
    feedbackCount: 0,
  });
  
  console.log(`📝 New agent registered: #${agentId} by ${owner}`);
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
  
  await context.db
    .update(agent, { id: agentId })
    .set({
      agentURI: newURI,
      updatedAt: event.block.timestamp,
    });
  
  console.log(`🔗 Agent #${agentId} URI updated`);
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
