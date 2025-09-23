// TronWeb PoolManager Initialize Testing Script
// Install dependencies: npm install --save-dev tronweb @types/node ts-node --legacy-peer-deps
import {
  POOL_MANAGER_ADDRESS,
  TRX_ADDRESS,
  USDT_ADDRESS,
  ETH_ADDRESS,
  USDC_ADDRESS,
  TUSD_ADDRESS,
  USDJ_ADDRESS,
  SUN_ADDRESS,
  WIN_ADDRESS,
} from './address'
// import { poolManagerAbi } from './abi/pool_manager_abi'
import {
  encodeSqrtPriceX96,
  encodeSqrtPriceX96WithoutDecimals,
  sqrtPriceX96ToRealPriceWithoutDecimals,
} from './math/sqrtPriceX96'
import { tronWeb, DEFAULT_FEE_2, DEFAULT_TICK_SPACING_2, encodeParameters, getPoolCandidatesByTokens } from './context'
import { PoolCandidate, PoolKey } from './types'

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

async function initialize(poolCandidate: PoolCandidate, token0Amount: bigint, token1Amount: bigint): Promise<void> {
  try {
    console.log('🚀 Starting PoolManager initialize test on Nile testnet...')
    console.log('📍 Contract Address:', POOL_MANAGER_ADDRESS)

    let token0 = poolCandidate.token0
    let token1 = poolCandidate.token1
    let token0Decimals = poolCandidate.decimals0
    let token1Decimals = poolCandidate.decimals1
    let hooks = poolCandidate.hook
    let fee = poolCandidate.fee
    let tickSpacing = poolCandidate.tickSpacing
    // Create pool key
    const poolKey = createPoolKey(token0, token1, hooks, POOL_MANAGER_ADDRESS, Number(fee), tickSpacing)

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

// Run the test
if (require.main === module) {
  // First check pool count
  checkPoolCount()
    .then(() => {
      const pool = getPoolCandidatesByTokens(TRX_ADDRESS, SUN_ADDRESS)[0]
      // Then run initialize test
      return initialize(pool, 100n, 20000n)
    })
    .catch((error) => {
      console.error('💥 Unhandled error:', error)
      process.exit(1)
    })
}

// Exports
export { initialize }
