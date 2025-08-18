// TronWeb PoolManager Initialize Testing Script
// Install dependencies: npm install --save-dev tronweb @types/node ts-node --legacy-peer-deps
import { TronWeb, utils as TronWebUtils } from 'tronweb'
import * as dotenv from 'dotenv'
import {
  POOL_MANAGER_ADDRESS,
  TRX_ADDRESS,
  USDT_ADDRESS,
  ETH_ADDRESS,
  USDC_ADDRESS,
  TUSD_ADDRESS,
  USDJ_ADDRESS,
  SUN_ADDRESS,
} from './address'
// import { poolManagerAbi } from './abi/pool_manager_abi'
import {
  encodeSqrtPriceX96,
  encodeSqrtPriceX96WithoutDecimals,
  sqrtPriceX96ToRealPriceWithoutDecimals,
} from './math/sqrtPriceX96'

// Load environment variables
dotenv.config()

// Interface definitions for better type safety
interface PoolKey {
  currency0: string
  currency1: string
  hooks: string
  poolManager: string
  fee: number
  parameters: string
}

// Initialize TronWeb instance
const tronWeb = new TronWeb(
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  process.env.PRIVATE_KEY
)

// Get token addresses from environment
const TOKEN0 = TRX_ADDRESS // TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
const TOKEN0_DECIMALS = 6
const TOKEN0_AMOUNT = 100
const TOKEN1 = SUN_ADDRESS
const TOKEN1_DECIMALS = 18
const TOKEN1_AMOUNT = 514071

// Helper function to encode parameters with tick spacing
function encodeParameters(tickSpacing: number): string {
  // Based on CLPoolParametersHelper: tickSpacing is stored at bits 16-39
  // tickSpacing 1 = 0x10000, tickSpacing 10 = 0xa0000, etc.
  const shifted = tickSpacing << 16
  return '0x' + shifted.toString(16).padStart(64, '0')
}

// Helper function to create pool key
function createPoolKey(
  currency0: string,
  currency1: string,
  hooks: string,
  poolManager: string,
  fee: number,
  tickSpacing: number
): PoolKey {
  // Ensure currency0 < currency1 (addresses must be sorted)
  if (currency0.toLowerCase() >= currency1.toLowerCase()) {
    ;[currency0, currency1] = [currency1, currency0]
  }

  return {
    currency0,
    currency1,
    hooks,
    poolManager,
    fee,
    parameters: encodeParameters(tickSpacing),
  }
}

async function testInitialize(): Promise<void> {
  try {
    console.log('🚀 Starting PoolManager initialize test on Nile testnet...')
    console.log('📍 Contract Address:', POOL_MANAGER_ADDRESS)

    // Pool configuration
    const hooks = '0x0000000000000000000000000000000000000000' // No hooks
    const fee = 500 // 0.05%
    const tickSpacing = 10 // Common tick spacing for 0.05% fee pools

    let token0 = TOKEN0
    let token0Decimals = TOKEN0_DECIMALS
    let token0Amount = TOKEN0_AMOUNT

    let token1 = TOKEN1
    let token1Decimals = TOKEN1_DECIMALS
    let token1Amount = TOKEN1_AMOUNT
    if (token0.toLowerCase() >= token1.toLowerCase()) {
      token0 = TOKEN1
      token1 = TOKEN0
      token0Decimals = TOKEN1_DECIMALS
      token1Decimals = TOKEN0_DECIMALS
      token0Amount = TOKEN1_AMOUNT
      token1Amount = TOKEN0_AMOUNT
    }

    // Create pool key
    const poolKey = createPoolKey(TOKEN0, TOKEN1, hooks, POOL_MANAGER_ADDRESS, fee, tickSpacing)

    console.log('📋 Pool Key:', {
      currency0: poolKey.currency0,
      currency1: poolKey.currency1,
      hooks: poolKey.hooks,
      poolManager: poolKey.poolManager,
      fee: poolKey.fee,
      parameters: poolKey.parameters,
      tickSpacing: tickSpacing,
    })

    // Calculate sqrt price for ratio (例如: 32 TRX = 100 USDT)
    const sqrtPriceX96 = encodeSqrtPriceX96WithoutDecimals(token0Amount, token1Amount, token0Decimals, token1Decimals)

    console.log('💰 Initial sqrt price:', sqrtPriceX96.toString())

    console.log(
      '💰 Initial real price:',
      sqrtPriceX96ToRealPriceWithoutDecimals(sqrtPriceX96, token0Decimals, token1Decimals)
    )

    // Use TronWeb's trigger smart contract method directly
    console.log('📞 Calling initialize function...')

    // Method 1: Use triggerSmartContract
    try {
      const functionSelector = 'initialize((address,address,address,address,uint24,bytes32),uint160)'

      // TronWeb parameter format
      const parameter = [
        { type: 'address', value: poolKey.currency0 },
        { type: 'address', value: poolKey.currency1 },
        { type: 'address', value: poolKey.hooks },
        { type: 'address', value: poolKey.poolManager },
        { type: 'uint24', value: poolKey.fee },
        { type: 'bytes32', value: poolKey.parameters },
        { type: 'uint160', value: sqrtPriceX96.toString() },
      ]

      const result = await tronWeb.transactionBuilder.triggerSmartContract(
        POOL_MANAGER_ADDRESS,
        functionSelector,
        {
          feeLimit: 100_000_000,
          callValue: 0,
        },
        parameter,
        tronWeb.address.toHex(tronWeb.defaultAddress.hex as string)
      )

      if (result.result && result.result.result) {
        console.log('✅ Transaction built successfully!')

        // Sign and broadcast the transaction
        const signedTransaction = await tronWeb.trx.sign(result.transaction)
        const broadcast = await tronWeb.trx.sendRawTransaction(signedTransaction)

        console.log('🔗 Transaction Hash:', broadcast.txid)

        // Wait for confirmation
        if (broadcast.result) {
          console.log('⏳ Waiting for transaction confirmation...')

          // Wait a bit for the transaction to be confirmed
          await new Promise((resolve) => setTimeout(resolve, 3000))

          try {
            const txInfo = await tronWeb.trx.getTransactionInfo(broadcast.txid)
            console.log('📊 Transaction Info:', {
              blockNumber: txInfo.blockNumber,
              fee: txInfo.fee,
              energyUsed: txInfo.receipt?.energy_usage_total || 0,
              result: txInfo.receipt?.result || 'SUCCESS',
            })

            // Check events
            if (txInfo.log && txInfo.log.length > 0) {
              console.log('📧 Events emitted:')
              for (const log of txInfo.log) {
                console.log('📄 Event:', {
                  address: tronWeb.address.fromHex(log.address),
                  topics: log.topics,
                  data: log.data,
                })
              }
            }
          } catch (infoError: any) {
            console.log('⚠️  Could not fetch transaction details:', infoError.message)
          }
        }
      } else {
        console.error('❌ Failed to build transaction:', result)
      }
    } catch (triggerError: any) {
      console.error('❌ Trigger smart contract failed:', triggerError.message)
    }

    console.log('🎉 Initialize test completed!')
  } catch (error: any) {
    console.error('❌ Initialize test failed:', error)

    // Common error messages and solutions
    if (error.message) {
      console.error('💬 Error Message:', error.message)

      if (error.message.includes('CurrenciesInitializedOutOfOrder')) {
        console.log('💡 Solution: Ensure currency0 < currency1 (addresses must be sorted)')
      } else if (error.message.includes('TickSpacingToo')) {
        console.log('💡 Solution: Use valid tick spacing (1-32767)')
      } else if (error.message.includes('LPFeeTooLarge')) {
        console.log('💡 Solution: Fee must be ≤ 1,000,000 (100%)')
      }
    }
  }
}

// Alternative method using constant call to check pool state
async function checkPoolCount(): Promise<void> {
  try {
    console.log('📊 Checking current pool count...')

    const functionSelector = 'poolCount()'
    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      POOL_MANAGER_ADDRESS,
      functionSelector,
      {},
      []
    )

    if (result.result && result.constant_result && result.constant_result.length > 0) {
      const poolCount = parseInt(result.constant_result[0], 16)
      console.log('📊 Current pool count:', poolCount.toString())
    } else {
      console.log('⚠️  Could not fetch pool count')
    }
  } catch (error: any) {
    console.error('❌ Failed to check pool count:', error.message)
  }
}

// Helper function to calculate pool ID using simple hash
async function calculatePoolId(poolKey: PoolKey): Promise<string> {
  try {
    // Create a simple deterministic ID
    const concatenated =
      poolKey.currency0 + poolKey.currency1 + poolKey.hooks + poolKey.poolManager + poolKey.fee + poolKey.parameters
    const hash = tronWeb.utils.ethersUtils.sha256(tronWeb.toHex(concatenated))
    return hash
  } catch (error: any) {
    console.error('❌ Failed to calculate pool ID:', error.message)
    return ''
  }
}

// Additional test functions
async function testGetSlot0(poolId: string): Promise<any> {
  try {
    console.log('🎯 Getting pool slot0 information...')

    const functionSelector = 'getSlot0(bytes32)'
    const parameter = [{ type: 'bytes32', value: poolId }]

    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      POOL_MANAGER_ADDRESS,
      functionSelector,
      {},
      parameter
    )

    if (result.result && result.constant_result && result.constant_result.length > 0) {
      // Parse hex results directly since decodeParams has API issues
      const hexResult = result.constant_result[0]
      const decoded = [
        parseInt(hexResult.slice(0, 42), 16), // sqrtPriceX96
        parseInt(hexResult.slice(42, 48), 16), // tick
        parseInt(hexResult.slice(48, 54), 16), // protocolFee
        parseInt(hexResult.slice(54, 60), 16), // lpFee
      ]

      console.log('🎯 Pool Slot0:', {
        sqrtPriceX96: decoded[0].toString(),
        tick: decoded[1].toString(),
        protocolFee: decoded[2].toString(),
        lpFee: decoded[3].toString(),
      })

      return decoded
    } else {
      console.log('⚠️  Could not fetch slot0')
    }
  } catch (error: any) {
    console.error('❌ Failed to get slot0:', error.message)
    return null
  }
}

// Run the test
if (require.main === module) {
  // First check pool count
  checkPoolCount()
    .then(() => {
      // Then run initialize test
      return testInitialize()
    })
    .catch((error) => {
      console.error('💥 Unhandled error:', error)
      process.exit(1)
    })
}

// Exports
export { testInitialize, testGetSlot0, createPoolKey, encodeParameters, calculatePoolId }
