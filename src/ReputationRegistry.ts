import { ponder } from "ponder:registry";
import { agent, feedback } from "ponder:schema";
import { parseFeedbackUri } from "./utils/feedbackUri";

// ============================================
// REPUTATION REGISTRY INDEXING
// ============================================

/**
 * Handle new feedback submission
 */
ponder.on("ReputationRegistry:NewFeedback", async ({ event, context }) => {
  const {
    agentId,
    clientAddress,
    feedbackIndex,
    value,
    valueDecimals,
    tag1,
    tag2,
    endpoint,
    feedbackURI,
    feedbackHash,
  } = event.args;
  
  // Extract comment from feedbackURI
  const { comment, error: commentError } = parseFeedbackUri(feedbackURI);
  
  // Insert the feedback record
  await context.db.insert(feedback).values({
    agentId: agentId,
    clientAddress: clientAddress,
    feedbackIndex: BigInt(feedbackIndex),
    value: value,
    valueDecimals: valueDecimals,
    tag1: tag1 || null,
    tag2: tag2 || null,
    endpoint: endpoint || null,
    feedbackURI: feedbackURI || null,
    feedbackHash: feedbackHash === "0x0000000000000000000000000000000000000000000000000000000000000000" 
      ? null 
      : feedbackHash,
    comment: comment,
    commentFetchedAt: comment ? event.block.timestamp : null,
    commentError: commentError,
    isRevoked: false,
    createdAt: event.block.timestamp,
    createdBlock: event.block.number,
    createdTxHash: event.transaction.hash,
  });
  
  // Update agent feedback count
  const existingAgent = await context.db.find(agent, { id: agentId });
  if (existingAgent) {
    const newCount = existingAgent.feedbackCount + 1;
    
    // Calculate new average rating if value represents a rating
    // Assuming tag1="starred" or similar indicates a rating
    let newAvgRating = existingAgent.avgRating;
    if (tag1 === "starred" || tag1 === "rating") {
      const normalizedValue = Number(value) / Math.pow(10, valueDecimals);
      if (existingAgent.avgRating === null) {
        newAvgRating = normalizedValue;
      } else {
        // Incremental average calculation
        newAvgRating = existingAgent.avgRating + (normalizedValue - existingAgent.avgRating) / newCount;
      }
    }
    
    await context.db
      .update(agent, { id: agentId })
      .set({
        feedbackCount: newCount,
        avgRating: newAvgRating,
        updatedAt: event.block.timestamp,
      });
  }
  
  console.log(`⭐ New feedback for agent #${agentId} from ${clientAddress}: ${value}/${10**valueDecimals} (${tag1 || 'untagged'})`);
});

/**
 * Handle feedback revocation
 */
ponder.on("ReputationRegistry:FeedbackRevoked", async ({ event, context }) => {
  const { agentId, clientAddress, feedbackIndex } = event.args;
  
  // Mark feedback as revoked
  await context.db
    .update(feedback, {
      agentId: agentId,
      clientAddress: clientAddress,
      feedbackIndex: BigInt(feedbackIndex),
    })
    .set({
      isRevoked: true,
      revokedAt: event.block.timestamp,
    });
  
  // Decrement agent feedback count
  const existingAgent = await context.db.find(agent, { id: agentId });
  if (existingAgent && existingAgent.feedbackCount > 0) {
    await context.db
      .update(agent, { id: agentId })
      .set({
        feedbackCount: existingAgent.feedbackCount - 1,
        updatedAt: event.block.timestamp,
      });
  }
  
  console.log(`❌ Feedback revoked for agent #${agentId} by ${clientAddress} (index: ${feedbackIndex})`);
});
