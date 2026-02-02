#!/usr/bin/env npx tsx
/**
 * Metadata Enrichment Worker
 * 
 * Fetches agent metadata from URIs and updates the database.
 * Run separately from indexing to maintain determinism.
 * 
 * Usage: npx tsx scripts/enrich-metadata.ts [--all] [--limit N]
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq, isNull, and, or } from "drizzle-orm";
import { fetchAgentMetadata } from "../src/lib/fetchMetadata";

// Parse args
const args = process.argv.slice(2);
const fetchAll = args.includes("--all");
const limitArg = args.find(a => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 100;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

interface AgentRow {
  id: bigint;
  agentURI: string | null;
  metadataFetchedAt: bigint | null;
}

async function main() {
  console.log("🔍 Metadata Enrichment Worker");
  console.log(`   Mode: ${fetchAll ? "all agents" : "unfetched only"}`);
  console.log(`   Limit: ${limit}`);
  console.log("");

  // Get agents that need metadata
  let query: string;
  if (fetchAll) {
    query = `
      SELECT id, "agentURI" 
      FROM agent 
      WHERE "agentURI" IS NOT NULL 
      ORDER BY "feedbackCount" DESC 
      LIMIT ${limit}
    `;
  } else {
    query = `
      SELECT id, "agentURI" 
      FROM agent 
      WHERE "agentURI" IS NOT NULL 
        AND "metadataFetchedAt" IS NULL 
      ORDER BY "feedbackCount" DESC 
      LIMIT ${limit}
    `;
  }

  const agents = await client.unsafe(query) as AgentRow[];
  console.log(`📋 Found ${agents.length} agents to process\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const agent of agents) {
    const id = agent.id.toString();
    const uri = agent.agentURI;
    
    if (!uri) {
      skipped++;
      continue;
    }

    process.stdout.write(`Agent #${id}: `);
    
    try {
      const metadata = await fetchAgentMetadata(uri);
      
      if (!metadata) {
        console.log("⚠️  No metadata parsed");
        await updateAgent(id, null, "No metadata parsed");
        failed++;
        continue;
      }

      // Extract service info
      const hasMCP = metadata.services?.some(s => s.name.toLowerCase() === "mcp") ?? false;
      const hasA2A = metadata.services?.some(s => s.name.toLowerCase() === "a2a") ?? false;
      
      const mcpTools: string[] = [];
      const a2aSkills: string[] = [];
      
      for (const svc of metadata.services || []) {
        if (svc.mcpTools) mcpTools.push(...svc.mcpTools);
        if (svc.a2aSkills) a2aSkills.push(...svc.a2aSkills);
      }

      await updateAgent(id, {
        name: metadata.name || null,
        description: metadata.description || null,
        image: metadata.image || null,
        active: metadata.active ?? null,
        x402Support: metadata.x402Support ?? false,
        hasMCP,
        hasA2A,
        mcpTools: mcpTools.length > 0 ? JSON.stringify(mcpTools) : null,
        a2aSkills: a2aSkills.length > 0 ? JSON.stringify(a2aSkills) : null,
      }, null);

      console.log(`✅ ${metadata.name || "(unnamed)"} | MCP:${hasMCP} A2A:${hasA2A}`);
      success++;
      
      // Rate limiting - be nice to servers
      await sleep(100);
      
    } catch (error: any) {
      console.log(`❌ ${error.message?.slice(0, 50) || "Unknown error"}`);
      await updateAgent(id, null, error.message || "Unknown error");
      failed++;
    }
  }

  console.log("\n📊 Summary:");
  console.log(`   ✅ Success: ${success}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  
  await client.end();
}

async function updateAgent(
  id: string,
  metadata: {
    name: string | null;
    description: string | null;
    image: string | null;
    active: boolean | null;
    x402Support: boolean;
    hasMCP: boolean;
    hasA2A: boolean;
    mcpTools: string | null;
    a2aSkills: string | null;
  } | null,
  error: string | null
) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  
  if (metadata) {
    await client.unsafe(`
      UPDATE agent SET
        name = $1,
        description = $2,
        image = $3,
        active = $4,
        "x402Support" = $5,
        "hasMCP" = $6,
        "hasA2A" = $7,
        "mcpTools" = $8,
        "a2aSkills" = $9,
        "metadataFetchedAt" = $10,
        "metadataError" = NULL
      WHERE id = $11
    `, [
      metadata.name,
      metadata.description,
      metadata.image,
      metadata.active,
      metadata.x402Support,
      metadata.hasMCP,
      metadata.hasA2A,
      metadata.mcpTools,
      metadata.a2aSkills,
      now.toString(),
      id,
    ]);
  } else {
    await client.unsafe(`
      UPDATE agent SET
        "metadataFetchedAt" = $1,
        "metadataError" = $2
      WHERE id = $3
    `, [now.toString(), error, id]);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
