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
    kind: "pglite",
  },
  
  chains: {
    // Ethereum Mainnet
    mainnet: {
      id: 1,
      rpc: http(process.env.PONDER_RPC_URL_1 ?? "https://eth.llamarpc.com"),
    },
    // Base (common L2 for agents)
    base: {
      id: 8453,
      rpc: http(process.env.PONDER_RPC_URL_8453 ?? "https://mainnet.base.org"),
    },
    // Sepolia testnet
    sepolia: {
      id: 11155111,
      rpc: http(process.env.PONDER_RPC_URL_11155111 ?? "https://ethereum-sepolia.publicnode.com"),
    },
  },
  
  contracts: {
    // Identity Registry - ERC-721 based agent registration
    IdentityRegistry: {
      abi: IdentityRegistryAbi,
      chain: "mainnet", // Change to deployment network
      address: IDENTITY_REGISTRY_ADDRESS,
      startBlock: START_BLOCK,
    },
    
    // Reputation Registry - Feedback system
    ReputationRegistry: {
      abi: ReputationRegistryAbi,
      chain: "mainnet", // Change to deployment network
      address: REPUTATION_REGISTRY_ADDRESS,
      startBlock: START_BLOCK,
    },
  },
});
