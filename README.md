# 8004-indexer

A [Ponder](https://ponder.sh) indexer for the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Trustless Agents standard.

> ⚠️ **Note**: ERC-8004 is currently in Draft status. Contract addresses will be updated once official deployments are available.

## Overview

ERC-8004 provides trust infrastructure for autonomous AI agents through:

- **Identity Registry**: ERC-721 based agent registration with portable identifiers
- **Reputation Registry**: Feedback and ratings from clients
- **Validation Registry**: Independent validator checks (zkML, TEE, stakers)

This indexer tracks all three registries and exposes the data via GraphQL.

## Schema

### Agent
| Field | Type | Description |
|-------|------|-------------|
| `id` | bigint | Agent ID (ERC-721 tokenId) |
| `owner` | address | Current owner |
| `agentURI` | string | URI to registration file |
| `agentWallet` | address | Verified payment address |
| `feedbackCount` | int | Total feedback received |
| `avgRating` | float | Average rating |

### Feedback
| Field | Type | Description |
|-------|------|-------------|
| `agentId` | bigint | Agent being rated |
| `clientAddress` | address | Rater |
| `value` / `valueDecimals` | bigint/int | Rating value |
| `tag1` / `tag2` | string | Categorization |
| `endpoint` | string | Specific endpoint rated |
| `feedbackURI` | string | Off-chain details |
| `isRevoked` | bool | Revocation status |

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure (edit ponder.config.ts with contract addresses)
# Set RPC URLs in .env

# Run in development
pnpm dev

# GraphQL available at http://localhost:42069/graphql
```

## Configuration

### Environment Variables

```bash
# .env
DATABASE_URL=postgres://user:pass@localhost:5432/erc8004  # Optional, uses SQLite by default
PONDER_RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
PONDER_RPC_URL_8453=https://mainnet.base.org
PONDER_RPC_URL_11155111=https://ethereum-sepolia.publicnode.com
```

### Contract Addresses

Update `ponder.config.ts` when contracts are deployed:

```typescript
const IDENTITY_REGISTRY_ADDRESS = "0x...";
const REPUTATION_REGISTRY_ADDRESS = "0x...";
const START_BLOCK = 12345678;
```

## Example Queries

### Get all agents
```graphql
query {
  agents(orderBy: "registeredAt", orderDirection: "desc", limit: 10) {
    items {
      id
      owner
      agentURI
      feedbackCount
      avgRating
    }
  }
}
```

### Get feedback for an agent
```graphql
query {
  feedbacks(where: { agentId: "1" }) {
    items {
      clientAddress
      value
      valueDecimals
      tag1
      isRevoked
    }
  }
}
```

### Top-rated agents
```graphql
query {
  agents(where: { avgRating_gt: 80 }, orderBy: "avgRating", orderDirection: "desc") {
    items {
      id
      avgRating
      feedbackCount
    }
  }
}
```

## Networks

- Ethereum Mainnet (chainId: 1)
- Base (chainId: 8453)  
- Sepolia testnet (chainId: 11155111)

## Links

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [8004.org](https://8004.org)
- [Discussion (Ethereum Magicians)](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098)
- [Ponder Documentation](https://ponder.sh/docs)

## License

MIT
