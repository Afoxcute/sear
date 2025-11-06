# Mantle IP Management Backend

This backend service provides IP (Intellectual Property) management functionality on the Mantle testnet using the Sear smart contract.

## Features

- **IP Registration**: Register IP assets on Mantle testnet using Sear contract
- **License Minting**: Mint licenses for IP assets with customizable terms
- **IPFS Integration**: Upload metadata to IPFS for decentralized storage
- **Yakoa Integration**: Submit registered IPs to Yakoa for monitoring

## Environment Variables

Create a `.env` file in the backend directory:

```env
WALLET_PRIVATE_KEY=your_private_key_here
RPC_PROVIDER_URL=https://rpc.sepolia.mantle.xyz
NFT_CONTRACT_ADDRESS=optional_nft_contract_address
```

## API Endpoints

### IP Registration
- **POST** `/api/register`
- **Body**:
  ```json
  {
    "ipMetadata": {
      "name": "IP Asset Name",
      "description": "IP Asset Description",
      "image": "https://ipfs.io/ipfs/...",
      "creator": "0x...",
      "created_at": "2024-01-01T00:00:00Z"
    },
    "nftMetadata": {
      "name": "NFT Name",
      "description": "NFT Description",
      "image": "https://ipfs.io/ipfs/..."
    },
    "searContractAddress": "0x0734d90FA1857C073c4bf1e57f4F4151BE2e9f82"
  }
  ```

### License Minting
- **POST** `/api/license/mint`
- **Body**:
  ```json
  {
    "ipAssetId": 1,
    "licensee": "0x...",
    "licenseTerms": {
      "royaltyPercentage": 10,
      "duration": 365,
      "commercialUse": true,
      "terms": "Commercial license terms..."
    },
    "searContractAddress": "0x0734d90FA1857C073c4bf1e57f4F4151BE2e9f82"
  }
  ```

## Network Configuration

- **Network**: Mantle Testnet
- **Chain ID**: 5003
- **RPC URL**: https://rpc.sepolia.mantle.xyz
- **Explorer**: https://sepolia-explorer.mantle.xyz
- **Native Token**: MNT (used as WIP_TOKEN_ADDRESS)

## Smart Contracts

- **Sear**: Main contract for IP registration and license management
- **ERC6551Registry**: Token-bound account registry
- **ERC6551Account**: Token-bound account implementation

## Installation

```bash
cd backend
yarn install
```

## Running the Server

```bash
yarn start
```

The server will start on port 5000 by default.

## Key Changes from Story Protocol

1. **Network**: Migrated from Story Protocol networks to Mantle testnet
2. **Token**: Using native MNT token instead of WIP tokens
3. **Contracts**: Using Sear contract instead of Story Protocol contracts
4. **API**: Updated endpoints to work with Mantle-specific functionality 