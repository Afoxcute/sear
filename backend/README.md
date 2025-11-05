# Etherlink IP Management Backend

This backend service provides IP (Intellectual Property) management functionality on the Etherlink testnet using the ModredIP smart contract.

## Features

- **IP Registration**: Register IP assets on Etherlink testnet using ModredIP contract
- **License Minting**: Mint licenses for IP assets with customizable terms
- **IPFS Integration**: Upload metadata to IPFS for decentralized storage
- **Yakoa Integration**: Submit registered IPs to Yakoa for monitoring

## Environment Variables

Create a `.env` file in the backend directory:

```env
WALLET_PRIVATE_KEY=your_private_key_here
RPC_PROVIDER_URL=https://node.ghostnet.etherlink.com
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
    "modredIpContractAddress": "0x0734d90FA1857C073c4bf1e57f4F4151BE2e9f82"
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
    "modredIpContractAddress": "0x0734d90FA1857C073c4bf1e57f4F4151BE2e9f82"
  }
  ```

## Network Configuration

- **Network**: Etherlink Testnet
- **Chain ID**: 128123
- **RPC URL**: https://node.ghostnet.etherlink.com
- **Explorer**: https://testnet.explorer.etherlink.com
- **Native Token**: XTZ (used as WIP_TOKEN_ADDRESS)

## Smart Contracts

- **ModredIP**: Main contract for IP registration and license management
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

1. **Network**: Migrated from Story Protocol networks to Etherlink testnet
2. **Token**: Using native XTZ token instead of WIP tokens
3. **Contracts**: Using ModredIP contract instead of Story Protocol contracts
4. **API**: Updated endpoints to work with Etherlink-specific functionality 