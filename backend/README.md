# Mantle IP Management Backend

This backend service provides IP (Intellectual Property) management functionality on the Mantle testnet using the ModredIP smart contract.

## Features

- **IP Registration**: Register IP assets on Mantle testnet using ModredIP contract
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
    "modredIpContractAddress": "0xe1D7ecf7b6631D6a3f334e42b57295CC3d954e26"
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
    "modredIpContractAddress": "0xe1D7ecf7b6631D6a3f334e42b57295CC3d954e26"
  }
  ```

## Network Configuration

- **Network**: Mantle Sepolia Testnet
- **Chain ID**: 5003
- **RPC URL**: https://rpc.sepolia.mantle.xyz
- **Explorer**: https://explorer.testnet.mantle.xyz
- **Native Token**: MNT (used as WIP_TOKEN_ADDRESS)

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

1. **Network**: Migrated from Story Protocol networks to Mantle testnet
2. **Token**: Using native MNT token instead of WIP tokens
3. **Contracts**: Using ModredIP contract instead of Story Protocol contracts
4. **API**: Updated endpoints to work with Mantle-specific functionality 