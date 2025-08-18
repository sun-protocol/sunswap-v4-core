# TronWeb PoolManager Initialize Testing

This script tests the `initialize` functionality of the PoolManager contract on the Tron Nile testnet.

## Prerequisites

1. **Deploy the PoolManager contract** to Nile testnet
2. **Have test tokens** deployed on Nile (or use existing ones)
3. **Tron wallet** with some TRX for gas fees

## Setup

### 1. Install Dependencies

```bash
# Run the setup script
chmod +x scripts/setup-tronweb.sh
./scripts/setup-tronweb.sh

# Or manually install:
npm install --save-dev tronweb @types/node ts-node
```

### 2. Configure Environment

Edit `.env` file with your actual values:

```env
PRIVATE_KEY=your_actual_private_key_here
TRON_API_KEY=your_tron_pro_api_key  # Optional but recommended
POOL_MANAGER_ADDRESS=TYourDeployedContractAddress
TOKEN0_ADDRESS=TToken0Address  # Must be < TOKEN1_ADDRESS
TOKEN1_ADDRESS=TToken1Address  # Must be > TOKEN0_ADDRESS
```

### 3. Update Contract Address

In `scripts/initialize.ts`, update:
```typescript
const POOL_MANAGER_ADDRESS = process.env.POOL_MANAGER_ADDRESS || 'YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE'
```

## Usage

### Run Initialize Test

```bash
# Using ts-node
npx ts-node scripts/initialize.ts

# Or compile first
npm run compile
node dist/scripts/initialize.js
```

### Key Parameters Explained

- **currency0/currency1**: Token addresses (must be sorted: currency0 < currency1)
- **hooks**: Hook contract address (use `0x0000000000000000000000000000000000000000` for no hooks)
- **fee**: LP fee in basis points (3000 = 0.3%, 10000 = 1%)
- **tickSpacing**: Tick spacing (common values: 1, 10, 60, 200)
- **sqrtPriceX96**: Initial price as sqrt(price) * 2^96

### Common Tick Spacing Values

| Fee Tier | Tick Spacing |
|----------|--------------|
| 0.01%    | 1            |
| 0.05%    | 10           |
| 0.3%     | 60           |
| 1%       | 200          |

### Price Calculation

```typescript
// For 1:1 price ratio
const SQRT_RATIO_1_1 = '79228162514264337593543950336'

// For other ratios, use: sqrt(price) * 2^96
// Example: price = 2.0 -> sqrt(2.0) * 2^96 ≈ 112045541949572279837463876454
```

## Testing Different Scenarios

### 1. Basic Pool Creation

```typescript
const poolKey = createPoolKey(
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT
  'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', // WTRX
  '0x0000000000000000000000000000000000000000', // No hooks
  POOL_MANAGER_ADDRESS,
  3000, // 0.3% fee
  60    // Tick spacing
)
```

### 2. Different Fee Tiers

```typescript
// 0.01% fee tier
const lowFeePool = createPoolKey(..., 100, 1)

// 1% fee tier  
const highFeePool = createPoolKey(..., 10000, 200)
```

## Error Handling

Common errors and solutions:

- **`CurrenciesInitializedOutOfOrder`**: Ensure currency0 < currency1
- **`TickSpacingTooSmall/TooLarge`**: Use valid tick spacing (1-32767)
- **`LPFeeTooLarge`**: Fee must be ≤ 1,000,000 (100%)
- **`NoLocker`**: Call must be within a `lock` transaction

## Verification

After successful initialization:

1. **Check pool count**: `poolManager.poolCount()`
2. **Get pool state**: `poolManager.getSlot0(poolId)`
3. **Verify events**: Look for `Initialize` event in transaction logs

## Additional Functions

```typescript
// Get pool information
await testGetSlot0(poolId)
await testGetLiquidity(poolId)

// Calculate pool ID
const poolId = await calculatePoolId(poolKey)
```

## Security Notes

- **Never commit private keys** to version control
- **Use environment variables** for sensitive data
- **Test on Nile testnet** before mainnet deployment
- **Verify contract addresses** before transactions 