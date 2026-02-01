import { createConfig } from "ponder";
import { http } from "viem";

import { IdentityRegistryAbi } from "./abis/IdentityRegistry";
import { ReputationRegistryAbi } from "./abis/ReputationRegistry";

// ============================================
// CONTRACT ADDRESSES (Official Deployments)
// ============================================

// Ethereum Mainnet
const MAINNET_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const MAINNET_REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;
const MAINNET_START_BLOCK = 24340900;

// Ethereum Sepolia
const SEPOLIA_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const SEPOLIA_REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
const SEPOLIA_START_BLOCK = 6800000;

// ============================================
// DATABASE CONFIG
// ============================================
// Use PostgreSQL in production, pglite for development
const isDev = process.env.NODE_ENV !== "production";
const databaseConfig = isDev 
  ? { kind: "pglite" as const }
  : { 
      kind: "postgres" as const,
      connectionString: process.env.DATABASE_URL,
    };

export default createConfig({
  database: databaseConfig,
  
  chains: {
    mainnet: {
      id: 1,
      rpc: http(process.env.PONDER_RPC_URL_1 ?? "https://eth.drpc.org"),
    },
    sepolia: {
      id: 11155111,
      rpc: http(process.env.PONDER_RPC_URL_11155111 ?? "https://ethereum-sepolia.publicnode.com"),
    },
  },
  
  contracts: {
    IdentityRegistry: {
      abi: IdentityRegistryAbi,
      chain: "mainnet",
      address: MAINNET_IDENTITY_REGISTRY,
      startBlock: MAINNET_START_BLOCK,
    },
    
    ReputationRegistry: {
      abi: ReputationRegistryAbi,
      chain: "mainnet",
      address: MAINNET_REPUTATION_REGISTRY,
      startBlock: MAINNET_START_BLOCK,
    },
  },
});
