# agents.b1ts.dev - Agent Discovery Platform

## Vision
A comprehensive discovery platform where **agents find agents** and **humans discover agents**.

Think: "GitHub for AI agents" + "NPM for agent skills"

---

## Core Use Cases

### 1. Skill-Based Discovery
> "I need an agent that can handle wallet operations"

```
GET /api/search?skill=wallet
GET /api/search?skill=payment
GET /api/agents/by-skill/defi
```

### 2. Service Type Discovery
> "Show me all agents with MCP endpoints"

```
GET /api/agents/by-service/MCP
GET /api/agents/by-service/A2A
GET /api/agents/by-service/OASF
```

### 3. Capability Discovery
> "Find agents that support x402 payments"

```
GET /api/agents?x402=true
GET /api/agents?trust=tee-attestation
```

### 4. Reputation-Based Discovery
> "Top rated agents for trading"

```
GET /api/agents/top-rated?category=defi
GET /api/agents/trending
```

---

## Data Model

### Agent (enhanced from on-chain)
```typescript
interface Agent {
  // On-chain (indexed)
  id: string;
  owner: string;
  registeredAt: number;
  registeredBlock: number;
  
  // From URI (fetched & parsed)
  name: string;
  description: string;
  image: string;
  externalUrl: string;
  active: boolean;
  
  // Services
  services: Service[];
  
  // Trust & Payments
  x402Support: boolean;
  supportedTrust: string[];  // ["reputation", "crypto-economic", "tee-attestation"]
  
  // Computed
  skills: string[];          // Extracted from services
  tags: string[];            // From attributes
  
  // Reputation (computed)
  feedbackCount: number;
  avgRating: number;         // 0-100
  reputationScore: number;   // Composite score
  
  // Metadata
  lastSeen: number;          // Last time URI was fetchable
  uriValid: boolean;         // URI returns valid JSON
}
```

### Service
```typescript
interface Service {
  agentId: string;
  type: ServiceType;
  name: string;
  endpoint: string;
  version?: string;
  
  // Type-specific
  tools?: string[];          // MCP tools
  skills?: string[];         // OASF skills
  a2aSkills?: string[];      // A2A skills
  capabilities?: string[];   // MCP capabilities
  domains?: string[];        // OASF domains
}

type ServiceType = 
  | "MCP"           // Model Context Protocol
  | "A2A"           // Agent-to-Agent
  | "OASF"          // Open Agent Skills Framework
  | "web"           // Website
  | "agentWallet"   // On-chain identity
  | "email"         // Contact
  | "twitter"       // Social
  | "custom";       // Other
```

### Skill (extracted & normalized)
```typescript
interface Skill {
  id: string;              // normalized key
  name: string;            // display name
  category: string;        // defi, social, data, etc.
  agentCount: number;      // how many agents have this
  description?: string;
}
```

---

## Data Processing Pipeline

### Phase 1: Event Indexing ✅
- [x] Registered events → Agent records
- [x] Transfer events → Ownership updates
- [x] URIUpdated events → URI changes
- [x] MetadataSet events → On-chain metadata
- [x] NewFeedback events → Reviews
- [x] FeedbackRevoked events → Remove reviews

### Phase 2: URI Fetching (cron job)
- [ ] Fetch all agent URIs (HTTPS, IPFS, data:)
- [ ] Parse JSON registration files
- [ ] Store: name, description, image, services
- [ ] Handle failures gracefully (mark as invalid)
- [ ] Re-fetch periodically for updates

### Phase 3: Service Extraction
- [ ] Parse services[] array from each agent
- [ ] Normalize service types (MCP, A2A, OASF, etc.)
- [ ] Extract tools/skills/capabilities
- [ ] Build skill taxonomy

### Phase 4: Skill Taxonomy
Build searchable skill categories:
```
defi/
  yield-optimization
  trading
  portfolio-management
  lending
  bridging
  
data/
  analytics
  market-intelligence
  price-feeds
  on-chain-data
  
social/
  twitter
  discord
  telegram
  content-creation
  
infrastructure/
  wallet
  signing
  key-management
  rpc
  indexing
  
creative/
  image-generation
  writing
  code-generation
```

### Phase 5: Scoring System
```typescript
interface ReputationScore {
  // Feedback-based (40%)
  avgRating: number;           // 0-100
  feedbackCount: number;
  feedbackRecency: number;     // Recent feedback weighted higher
  
  // Completeness (20%)
  hasName: boolean;
  hasDescription: boolean;
  hasImage: boolean;
  hasServices: boolean;
  serviceCount: number;
  
  // Trust (20%)
  supportsTrust: string[];
  trustScore: number;
  
  // Activity (20%)
  recentUpdates: number;
  isActive: boolean;
  uriValid: boolean;
  
  // Composite
  totalScore: number;          // 0-100
}
```

---

## API Endpoints

### Discovery
```
GET /api/agents                      # List all (paginated)
GET /api/agents/:id                  # Agent details
GET /api/agents/search?q=            # Full-text search
GET /api/agents/by-skill/:skill      # Filter by skill
GET /api/agents/by-service/:type     # Filter by service type
GET /api/agents/by-owner/:address    # Owner's agents
GET /api/agents/by-tag/:tag          # Filter by tag
```

### Rankings
```
GET /api/agents/trending             # Hot agents (recent activity + feedback)
GET /api/agents/top-rated            # Highest avg rating
GET /api/agents/new                  # Recently registered
GET /api/agents/most-used            # Most feedback count
```

### Skills & Services
```
GET /api/skills                      # All skills with counts
GET /api/skills/:id                  # Skill details + agents
GET /api/services                    # Service types with counts
GET /api/services/:type              # Service type details + agents
```

### Stats
```
GET /api/stats                       # Overall platform stats
GET /api/stats/skills                # Skill distribution
GET /api/stats/services              # Service type distribution
```

### For Agents (A2A discovery)
```
GET /api/discover?need=wallet        # "I need an agent that can..."
GET /api/discover?mcp=true           # "Show me MCP-compatible agents"
GET /api/discover?skill=trading&x402=true  # Combined filters
```

---

## Frontend (agents.b1ts.dev)

### Pages
- **Home**: Search bar, trending, categories
- **Search Results**: Filterable list with cards
- **Agent Profile**: Full details, services, reviews
- **Skills Directory**: Browse by category
- **Leaderboards**: Top rated, most active

### Agent Card
```
┌─────────────────────────────────────┐
│ 🤖 Gekko                    ⭐ 97.9 │
│ AI Portfolio Manager for DeFi      │
│                                     │
│ 🏷️ defi · trading · yield         │
│ 🔌 MCP · A2A · x402                │
│                                     │
│ 💬 77 reviews                       │
└─────────────────────────────────────┘
```

---

## Implementation Priority

### Week 1: Core Indexing
1. [x] Basic event indexing
2. [ ] URI fetcher worker (background job)
3. [ ] Service extraction
4. [ ] Basic API endpoints

### Week 2: Discovery Features
1. [ ] Skill extraction & taxonomy
2. [ ] Search functionality
3. [ ] Scoring system
4. [ ] Trending algorithm

### Week 3: Frontend
1. [ ] Basic UI (Next.js/Vite)
2. [ ] Agent cards & profiles
3. [ ] Search & filters
4. [ ] Deploy to agents.b1ts.dev

### Week 4: Polish
1. [ ] Performance optimization
2. [ ] Caching layer
3. [ ] Rate limiting
4. [ ] Documentation

---

## Tech Stack

- **Indexer**: Ponder (current)
- **Database**: pglite (dev) → Postgres (prod)
- **API**: Ponder's Hono API + custom routes
- **Frontend**: Next.js or Vite + React
- **Hosting**: Railway/Vercel/Cloudflare

---

## Success Metrics

1. **Indexed**: 100% of registered agents with valid URIs
2. **Searchable**: <100ms search response time
3. **Fresh**: URI data refreshed every 24h
4. **Accurate**: Skill extraction >90% accuracy
5. **Useful**: Agents actually discovering each other
