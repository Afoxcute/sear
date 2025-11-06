import { Chain, createPublicClient, createWalletClient, http, WalletClient } from 'viem'
import { privateKeyToAccount, Address, Account } from 'viem/accounts'
import dotenv from 'dotenv'

dotenv.config()

// Mantle testnet configuration
const mantleTestnet: Chain = {
  id: 5003,
  name: 'Mantle Testnet',
  nativeCurrency: {
    name: 'MNT',
    symbol: 'MNT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
    public: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Mantle Testnet Explorer',
      url: 'https://sepolia-explorer.mantle.xyz',
    },
  },
}

interface NetworkConfig {
    rpcProviderUrl: string
    blockExplorer: string
    chain: Chain
    nativeTokenAddress: Address
}

// Network configuration
const networkConfig: NetworkConfig = {
    rpcProviderUrl: 'https://rpc.sepolia.mantle.xyz',
    blockExplorer: 'https://sepolia-explorer.mantle.xyz',
    chain: mantleTestnet,
    nativeTokenAddress: '0x0000000000000000000000000000000000000000' as Address, // Native MNT token
}

// Helper functions
const validateEnvironmentVars = () => {
    if (!process.env.WALLET_PRIVATE_KEY) {
        throw new Error('WALLET_PRIVATE_KEY is required in .env file')
    }
}

// Initialize configuration
validateEnvironmentVars()

export const networkInfo = {
    ...networkConfig,
    rpcProviderUrl: process.env.RPC_PROVIDER_URL || networkConfig.rpcProviderUrl,
}

export const account: Account = privateKeyToAccount(`0x${process.env.WALLET_PRIVATE_KEY}` as Address)

const baseConfig = {
    chain: networkInfo.chain,
    transport: http(networkInfo.rpcProviderUrl),
} as const

export const publicClient = createPublicClient(baseConfig)
export const walletClient = createWalletClient({
    ...baseConfig,
    account,
}) as WalletClient

// Export constants
export const NATIVE_TOKEN_ADDRESS = networkInfo.nativeTokenAddress
export const BLOCK_EXPLORER_URL = networkInfo.blockExplorer
