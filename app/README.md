# Sear Frontend

A React-based frontend for the Sear intellectual property management system on Mantle.

## Features

### 1. Register IP Asset
- Mint an NFT representing ownership of your intellectual property
- Register the NFT as an IP Asset on the Sear system
- Upload IP content and metadata to IPFS
- Set encryption flags for sensitive content

### 2. Mint License Tokens
- Create license tokens from registered IP Assets
- **One License Per IP**: Only one license can be minted per IP asset (enforced validation)
- Set royalty percentages (1-100%)
- Define license duration in seconds
- Specify commercial use permissions
- Attach license terms (stored on IPFS)

### 3. Pay Revenue
- Send payments to IP Assets
- Automatic royalty distribution to license holders
- Support for both tips and revenue sharing

### 4. Claim Royalties
- License holders can claim their accumulated royalties
- Automatic calculation based on royalty percentages
- Direct transfer to wallet addresses

### 5. Arbitration System
- **Register as Arbitrator**: Stake MNT to become an arbitrator
- **Unstake**: Withdraw stake when no active disputes assigned
- **Submit Decisions**: Vote on disputes (uphold or reject)
- **Auto-Resolution**: Disputes resolve automatically when majority is clear
- **Reputation System**: Earn reputation for correct decisions

## Getting Started

1. **Install Dependencies**
   ```bash
   yarn install
   ```

2. **Set Environment Variables**
   - Get a Thirdweb Client ID from [thirdweb.com](https://thirdweb.com)
   - Update `src/main.tsx` with your client ID

3. **Start Development Server**
   ```bash
   yarn dev
   ```

4. **Connect Wallet**
   - Use the Connect button to link your wallet
   - Supported wallets: MetaMask, Coinbase Wallet, Trust Wallet, and more

## Usage Guide

### Registering an IP Asset
1. Prepare your IP content and upload to IPFS
2. Upload metadata (JSON) to IPFS
3. Enter the IPFS hashes in the "Register IP Asset" section
4. Check "Encrypted Content" if your IP is encrypted
5. Click "Register IP" and confirm the transaction

### Creating Licenses
1. Select an existing IP Asset from the dropdown
2. Set the royalty percentage (e.g., 10 for 10%)
3. Choose license duration (minimum 1 hour = 3600 seconds)
4. Enable/disable commercial use
5. Upload license terms to IPFS and enter the hash
6. Click "Mint License" and confirm the transaction

### Paying Revenue
1. Select the target IP Asset
2. Enter the payment amount in MNT
3. Click "Pay Revenue" and confirm the transaction
4. Royalties will be automatically distributed to license holders

### Claiming Royalties
1. Select the IP Asset you have licenses for
2. Click "Claim Royalties"
3. Confirm the transaction to receive your accumulated royalties

## Technical Details

- **Blockchain**: Mantle Sepolia Testnet (Chain ID: 5003)
- **Smart Contract**: Sear.sol
- **Wallet Integration**: Thirdweb SDK
- **IPFS**: Used for storing IP content, metadata, and license terms
- **ERC-6551**: Token-bound accounts for IP management

## Contract Addresses

Current deployed contract addresses are stored in `src/deployed_addresses.json`:
- **Sear (V2)**: `0x2D0456CE5e446ef9C8f513832a0bd361201990Ab` (ModredIPModule#ModredIP)
- **ERC6551Registry**: `0xE8e9E9dce38bEa250e35Fc212DAE0EA836EF4E7B`
- **ERC6551Account**: `0xe01C006f52F3b78ed62C9A71B8Cbd3644b5eA749`

**Note**: The contract key "ModredIPModule#ModredIP" is maintained for compatibility, but the application name is "Sear".

## Security Features

- Reentrancy protection
- Access control for admin functions
- Dispute resolution system with arbitration
- Encrypted content support
- On-chain royalty tracking
- License validation (one license per IP)
- Nonce management with retry logic
- Transaction error handling and recovery

## Support

For issues or questions, please refer to the main project documentation or create an issue in the repository.
