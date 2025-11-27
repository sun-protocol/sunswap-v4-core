import { encodeCLPositionManagerDecreaseLiquidityCalldata } from '@pancakeswap/infinity-sdk'

import { TRX_ADDRESS, SUN_ADDRESS, POSITION_MANAGER_ADDRESS, POOL_MANAGER_ADDRESS, USDC_ADDRESS } from './address'
import {
  tronWeb,
  toEvmHex,
  DEFAULT_TICK_SPACING,
  ZERO_HEX_ADDRESS,
  getEvmAccount,
  DEFAULT_FEE,
  getPoolCandidatesByTokens,
} from './context'
import { getPosition } from './getPosition'
import { PoolCandidate } from './types'

// Usage in your test script
export const decreaseLiquidity = async (poolCandidate: PoolCandidate, tokenId: bigint, liquidity?: bigint) => {
  const account = getEvmAccount()

  let token0 = poolCandidate.token0
  let token1 = poolCandidate.token1
  let token0Evm = poolCandidate.token0Evm
  let token1Evm = poolCandidate.token1Evm

  const position = await getPosition(tokenId)

  if (!liquidity) {
    liquidity = position.liquidity
  }

  if (token0Evm.toLowerCase() >= token1Evm.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
    ;[token0Evm, token1Evm] = [token1Evm, token0Evm]
  }

  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  try {
    const multicallData = encodeCLPositionManagerDecreaseLiquidityCalldata({
      tokenId: tokenId,
      poolKey: {
        currency0: token0Evm as `0x${string}`,
        currency1: token1Evm as `0x${string}`,
        hooks: ZERO_HEX_ADDRESS,
        poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
        fee: Number(DEFAULT_FEE),
        parameters: {
          tickSpacing: DEFAULT_TICK_SPACING,
        },
      },
      liquidity: liquidity as bigint,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: account.address,
      hookData: '0x',
      deadline: BigInt(deadline),
    })

    console.log('Multicall data:', multicallData)

    // Broadcast the transaction on-chain
    const functionSelector = 'multicall(bytes[])'

    // Prepare parameters for the transaction
    const parameter = [
      {
        type: 'bytes[]',
        value: [multicallData],
      },
    ]

    // Build the transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      POSITION_MANAGER_ADDRESS,
      functionSelector,
      {
        feeLimit: 500_000_000, // 500 TRX fee limit
      },
      parameter,
      undefined
    )

    if (transaction.result && transaction.result.result) {
      console.log('✅ Transaction built successfully!')

      // Sign and broadcast the transaction
      const signedTransaction = await tronWeb.trx.sign(transaction.transaction)
      const broadcast = await tronWeb.trx.sendRawTransaction(signedTransaction)

      console.log('🔗 Transaction Hash:', broadcast.txid)

      // Wait for confirmation
      if (broadcast.result) {
        console.log('⏳ Waiting for transaction confirmation...')

        // Wait a bit for the transaction to be confirmed
        await new Promise((resolve) => setTimeout(resolve, 6000))

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
          throw infoError
        }
      }
    } else {
      console.error('❌ Failed to build transaction:', transaction)
      throw transaction
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

if (require.main === module) {
  const poolCandidate = getPoolCandidatesByTokens(TRX_ADDRESS, SUN_ADDRESS)[0]
  decreaseLiquidity(poolCandidate, 1n).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
