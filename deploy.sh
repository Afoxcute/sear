#!/bin/bash

# Contract Deployment Script for Mantle Sepolia Testnet
# Make sure you have DEPLOYER_PRIVATE_KEY set in your environment or .env file

echo "🚀 Deploying Sear contract to Mantle Sepolia Testnet..."
echo ""

# Check if DEPLOYER_PRIVATE_KEY is set
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ Error: DEPLOYER_PRIVATE_KEY not set"
    echo "Please set it in your .env file or export it:"
    echo "  export DEPLOYER_PRIVATE_KEY=your_private_key_here"
    exit 1
fi

echo "✅ Deployer private key found"
echo ""

# Deploy the contract
echo "📦 Deploying contract..."
npx hardhat ignition deploy ignition/modules/Sear.ts --network mantleTestnet

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Copy the deployed contract address from the output above"
echo "2. Update app/src/deployed_addresses.json with the new address:"
echo "   \"SearModule#Sear\": \"NEW_ADDRESS_HERE\""
echo "3. Restart your backend and frontend"
echo ""
