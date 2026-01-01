# Contract Redeployment Instructions

## Prerequisites

1. **Set your deployer private key** (the wallet that will deploy the contract):
   
   **PowerShell:**
   ```powershell
   $env:DEPLOYER_PRIVATE_KEY = "your_private_key_without_0x_prefix"
   ```
   
   **Or create a `.env` file** in the `searalt` directory:
   ```
   DEPLOYER_PRIVATE_KEY=your_private_key_without_0x_prefix
   ```

2. **Ensure you have MNT tokens** in your deployer wallet for gas fees on Mantle Sepolia Testnet

## Step 2: Deploy the Contract

Navigate to the `searalt` directory and run:

**PowerShell:**
```powershell
cd searalt
npx hardhat ignition deploy ignition/modules/ModredIP.ts --network mantleTestnet
```

**Or use the deployment script:**
```powershell
.\deploy.ps1
```

## Step 3: Update Contract Address

After deployment, you'll see output like:
```
✅ ModredIPModule#ModredIP deployed to: 0x...
```

1. **Copy the deployed contract address**

2. **Update `app/src/deployed_addresses.json`:**
   ```json
   {
     "ModredIPModule#ModredIP": "NEW_DEPLOYED_ADDRESS_HERE"
   }
   ```

3. **Also update `ignition/deployments/chain-5003/deployed_addresses.json`** (optional, for reference)

## Step 4: Restart Services

1. **Restart your backend server** (if running)
2. **Refresh your frontend** (or restart the dev server)

## Verification

After deployment, verify the contract has the `unstake` function:

1. Visit: https://explorer.testnet.mantle.xyz/address/YOUR_NEW_CONTRACT_ADDRESS
2. Go to the "Contract" tab
3. Check for the `unstake` function in the "Write Contract" section

## Troubleshooting

### "already known" Error

If you get an `already known` error during deployment, it means there's a pending transaction with the same nonce. Solutions:

1. **Wait for pending transactions to confirm:**
   - Check your deployer address on the explorer: https://explorer.testnet.mantle.xyz/address/YOUR_DEPLOYER_ADDRESS
   - Wait for any pending transactions to be confirmed (usually 1-2 minutes)
   - Then try deploying again

2. **Check nonce status:**
   ```powershell
   node check-nonce.js
   ```
   This will show if you have pending transactions.

3. **Wait and retry:**
   - Wait 2-3 minutes
   - Run the deployment command again

**Note**: The backend now includes automatic retry logic that handles "already known" errors. If you see this error in the backend logs, the system will automatically retry the transaction.

### HTTP 410 Error (RPC Limitation)

If you encounter HTTP 410 errors related to `pending` blockTag:

- **Cause**: Mantle RPC doesn't support `blockTag: 'pending'` for `eth_getTransactionCount`
- **Solution**: The backend automatically detects and handles these errors
- **Retry**: The system will automatically retry with longer delays (2s, 4s, 6s)
- **Recovery**: Transaction hash recovery from recent blocks if available

### Other Issues

- **"Missing env var DEPLOYER_PRIVATE_KEY"**: Make sure you set the environment variable before running the deploy command
- **"Insufficient funds"**: Make sure your deployer wallet has MNT tokens for gas
- **Network errors**: Check your internet connection and that the Mantle RPC endpoint is accessible

## What Changed

The new contract includes:
- `unstake()` function - allows arbitrators to withdraw their stake
- `ArbitratorUnstaked` event - emitted when an arbitrator unstakes
- Safety check - prevents unstaking if assigned to active disputes

