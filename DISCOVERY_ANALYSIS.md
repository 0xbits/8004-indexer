# ERC-8004 Discovery Analysis

## Executive Summary
The dataset covers 20,441 agents, but only 8,632 (42.23%) have metadata and 10,663 (52.16%) have a URI. The structured fields that enable discovery (tags, protocols, chain, capabilities, tools, skills) are mostly empty even among agents with metadata. As a result, the current discovery experience is dominated by unstructured text search and manual inspection rather than reliable filtering or ranking.

Discovery for agents and developers is particularly constrained by missing or inconsistent machine-readable capability data. MCP adoption is very low (60 agents, 0.29%) and only 8% of the sampled MCP agents list any tools. A2A skills are present for only half of sampled A2A agents, and 32% of those lists contain duplicates or inconsistent taxonomies. This makes programmatic matching unreliable.

The highest-impact improvements are: (1) enforce or incentivize minimal metadata completeness, (2) normalize and enrich capabilities/tags, and (3) implement dedup/spam controls. With these in place, the platform can support meaningful human discovery, agent-to-agent matching, and developer integrations, and position itself to register as an ERC-8004 agent.

## Data Quality Assessment
### Statistics
- Total agents: 20,441
- Agents with metadata: 8,632 (42.23%)
- Agents with URI: 10,663 (52.16%)
- Agents with MCP: 60 (0.29%)
- Agents with A2A: 86 (0.42%)
- Agents with x402: 4,031 (19.72%)
- Total feedback entries: 658 (0.032 feedback per agent on average)
- Chain breakdown: only "base" appears, count = 1 (likely missing chain data rather than actual distribution)
- Top tags/protocols: each appears with count 1 (signals near-empty tagging)

### Issues Found
- Large volume of empty records in the sample query:
  - In the 100-agent sample, 57% missing name and 57% missing description; 45% missing URI.
  - 59% missing image and 96% missing externalUrl.
  - 99% missing tags/protocols/chain/chainId.
- Even among agents with metadata (100-agent sample from the metadata endpoint):
  - 96% missing externalUrl.
  - 99% missing tags, protocols, chain, and chainId.
  - 38% missing supportedTrust; 95% missing mcpCapabilities; 96% missing mcpTools; 76% missing a2aSkills.
  - 88% of metadata agents have reasonably descriptive text (description length >= 40 chars), but structured fields remain sparse.
- Duplicates and likely spam patterns:
  - 11 agents in the 100-agent sample share the same URI (https://ag0.xyz) with empty metadata.
  - One owner address appears 36 times with identical null metadata and the same wallet address, indicating bulk or scripted registrations.
- Inconsistent capability taxonomies:
  - A2A skills mix hierarchical paths and free-form labels (e.g., "Analytical skills", "swap:quote").
  - 32% of A2A agent entries in the sample contain duplicate skills in the same list.
- MCP tooling data is mostly absent:
  - Only 4 of 50 MCP agents (8%) in the sample list any MCP tools.

### Recommendations
- Enforce a minimum metadata completeness standard (name + description + URI + at least one capability field).
- Normalize and validate tags/protocols/skills (controlled vocabularies, schema validation, dedupe).
- Implement spam and duplicate detection (rate limits per owner, duplicate URI/wallet checks).
- Backfill structured fields using automated enrichment (LLM classification + human curation for top agents).

## Discovery Gap Analysis
### For Humans
- Use-case search is weak: tags are nearly absent and topTags shows no meaningful coverage, so queries like "DeFi yield optimization" cannot rely on structured matching.
- Comparison and reputation are thin: only 658 total feedback entries across 20,441 agents, and many agents have null avgRating.
- Category/vertical browsing is not feasible: protocols/chain data is missing for ~99% of sampled agents with metadata.

### For Agents
- Machine-readable matching is inconsistent: A2A skills are missing for half of sampled A2A agents and frequently duplicated or unnormalized.
- MCP discovery is shallow: the majority of MCP agents do not expose tool lists, making automated selection or tool routing unreliable.
- Schema mismatch risk: A2A skills mix hierarchies and free-form labels, preventing deterministic matching.

### For Developers
- API predictability suffers from sparse metadata: most structured filters would return few results.
- Tooling and SDK potential is undercut by missing capability fields and inconsistent taxonomies.
- The discovery API lacks standardized schemas for MCP tools and A2A skills, making integration brittle.

## Proposed Improvements
### High Priority
- Metadata completeness requirements (small/medium): Require name, description, URI, and at least one of tags/protocols/skills at registration or via post-registration validation. Provide clear error reporting for missing fields.
- Capability normalization (medium): Introduce controlled vocabularies for tags, protocols, A2A skills, and MCP tools; store both raw and normalized forms; dedupe within lists.
- Spam and duplicate controls (medium): Rate-limit per owner, detect duplicate URI/wallet/name clusters, and flag batch registrations with null metadata for review.

### Medium Priority
- Automated enrichment (medium/large): Use LLM-based classification on descriptions to infer tags, protocols, and capabilities, then mark as inferred to preserve provenance.
- Reputation and quality signals (medium): Add verified badges, uptime checks for URIs, and trust score aggregation. Encourage feedback submissions.
- MCP and A2A schema validation (medium): Validate MCP tool lists and A2A skill lists against published schemas; surface validation errors in the API.

### Low Priority
- Human-friendly curation layers (small/medium): Editorial collections and featured lists for top verticals (DeFi, trading, research, creative, infra).
- UI comparisons (small): Side-by-side comparison for top agents using normalized capability and reputation fields.
- Ecosystem integrations (medium): Provide reference SDKs (JS/TS, Python) and example MCP/A2A clients for discovery queries.

## Next Steps
- Run a full metadata audit and publish a completeness report (overall and by owner).
- Implement normalization and dedupe pipelines for tags, protocols, and A2A skills.
- Add spam detection rules for repeated URI/wallet registrations with null metadata.
- Define and publish a discovery schema (tags/protocols/skills/tool descriptors) with validation rules.
- Register this platform as an ERC-8004 agent with MCP and A2A endpoints to dogfood discovery.
