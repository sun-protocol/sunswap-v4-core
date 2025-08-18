#!/bin/bash

# Setup script for TronWeb testing environment
echo "🔧 Setting up TronWeb testing environment..."

# Install required dependencies
echo "📦 Installing TronWeb and type definitions..."
npm install --save-dev tronweb @types/node

# Create .env file template if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file template..."
    cat > .env << EOL
# Tron Network Configuration
PRIVATE_KEY=your_private_key_here
TRON_API_KEY=your_tron_api_key_here

# Contract Addresses on Nile Testnet
POOL_MANAGER_ADDRESS=your_deployed_contract_address_here

# Test Token Addresses (replace with actual Nile testnet tokens)
TOKEN0_ADDRESS=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TOKEN1_ADDRESS=TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR
EOL
    echo "⚠️  Please edit .env file with your actual values"
fi

echo "✅ Setup complete!"
echo "📋 Next steps:"
echo "1. Edit .env file with your private key and contract address"
echo "2. Run: npm run ts-node scripts/initialize.ts"
echo "   Or: npx ts-node scripts/initialize.ts" 