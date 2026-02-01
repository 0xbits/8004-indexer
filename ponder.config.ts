import { createConfig } from "ponder";
import { http } from "viem";

import { IdentityRegistryAbi } from "./abis/IdentityRegistry";
import { ReputationRegistryAbi } from "./abis/ReputationRegistry";

// ============================================
// CONFIGURATION
// ============================================

// Contract addresses - UPDATE THESE when deployed
const IDENTITY_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const REPUTATION_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Start block - UPDATE THIS to the deployment block
const START_BLOCK = 0;

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL,
  },
  
  networks: {
    // Ethereum Mainnet
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1 ?? "https://eth.llamarpc.com"),
    },
    // Base (common L2 for agents)
    base: {
      chainId: 8453,
      transport: http(process.env.PONDER_RPC_URL_8453 ?? "https://mainnet.base.org"),
    },
    // Sepolia testnet
    sepolia: {
      chainId: 11155111,
      transport: http(process.env.PONDER_RPC_URL_11155111 ?? "https://ethereum-sepolia.publicnode.com"),
    },
  },
  
  contracts: {
    // Identity Registry - ERC-721 based agent registration
    IdentityRegistry: {
      abi: IdentityRegistryAbi,
      network: "mainnet", // Change to deployment network
      address: IDENTITY_REGISTRY_ADDRESS,
      startBlock: START_BLOCK,
    },
    
    // Reputation Registry - Feedback system
    ReputationRegistry: {
      abi: ReputationRegistryAbi,
      network: "mainnet", // Change to deployment network
      address: REPUTATION_REGISTRY_ADDRESS,
      startBlock: START_BLOCK,
    },
  },
});
