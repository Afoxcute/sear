# ModredIP Frontend

A React-based frontend for the ModredIP intellectual property management system on Mantle.

## Features

### 1. Register IP Asset
- Mint an NFT representing ownership of your intellectual property
- Register the NFT as an IP Asset on the ModredIP system
- Upload IP content and metadata to IPFS
- Set encryption flags for sensitive content

### 2. Mint License Tokens
- Create license tokens from registered IP Assets
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
- **Smart Contract**: ModredIP.sol
- **Wallet Integration**: Thirdweb SDK
- **IPFS**: Used for storing IP content, metadata, and license terms
- **ERC-6551**: Token-bound accounts for IP management

## Contract Addresses

- **ModredIP**: `0xeEFa27Ade566b6D4F6339EA2229aCf66a61D94e0`
- **ERC6551Registry**: `0x9be86cb3691785f591DE11aa398863B89241B677`
- **ERC6551Account**: `0x2fA171a2F9F579A210516150B44bcE8d720e657A`

## Security Features

- Reentrancy protection
- Access control for admin functions
- Dispute resolution system
- Encrypted content support
- On-chain royalty tracking

## Support

For issues or questions, please refer to the main project documentation or create an issue in the repository.
