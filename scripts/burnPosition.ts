import { encodeAbiParameters, encodeFunctionData, Hex, parseAbiParameters, toHex, concatHex } from 'viem'
import { TRX_ADDRESS, SUN_ADDRESS, POSITION_MANAGER_ADDRESS, USDC_ADDRESS } from './address'
import { tronWeb, toEvmHex, getEvmAccount, getPoolCandidatesByTokens } from './context'
import { PoolCandidate } from './types'

import {
  ActionsPlanner,
  ACTIONS,
  CLPositionConfig,
  EncodedCLPositionConfig,
  ACTION_CONSTANTS,
  CLPositionManagerAbi,
} from './action'

// Usage in your test script
export const burnPosition = async (poolCandidate: PoolCandidate, tokenId: bigint) => {
  let token0 = poolCandidate.token0
  let token1 = poolCandidate.token1
  let token0Evm = poolCandidate.token0Evm
  let token1Evm = poolCandidate.token1Evm
  if (token0Evm.toLowerCase() >= token1Evm.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
    ;[token0Evm, token1Evm] = [token1Evm, token0Evm]
  }

  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  try {
    const multicallData = encodeCLPositionManagerBurnCalldata(
      tokenId,
      token0Evm as `0x${string}`,
      token1Evm as `0x${string}`,
      0n,
      0n,
      '0x',
      BigInt(deadline)
    )

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

const encodeCLPositionManagerBurnCalldata = (
  tokenId: bigint,
  currency0: `0x${string}`,
  currency1: `0x${string}`,
  amount0Min: bigint,
  amount1Min: bigint,
  hookData: Hex = '0x',
  deadline: bigint
) => {
  const planner = new ActionsPlanner()

  planner.add(ACTIONS.CLOSE_CURRENCY, [currency0])
  planner.add(ACTIONS.CLOSE_CURRENCY, [currency1])

  const encodeCustom = (planner: ActionsPlanner) => {
    const encodeAbi = parseAbiParameters('bytes, bytes[]')
    let actions = planner.encodeActions()
    actions = concatHex([toHex(ACTIONS.CL_BURN_POSITION, { size: 1 }), actions])
    console.log('actions', actions)
    const plans = planner.encodePlans()

    //XXX: workaround for custom CL_BURN_POSITION to replace index 0 plan with params without positionConfig
    const customBurnAbi = parseAbiParameters([
      'uint256 tokenId, uint128 amount0Min, uint128 amount1Min, bytes hookData',
    ])

    // put in the first of the plans
    plans.unshift(encodeAbiParameters(customBurnAbi, [tokenId, amount0Min, amount1Min, hookData]))

    console.log('plans', plans)
    return encodeAbiParameters(encodeAbi, [actions, plans])
  }

  const calls = encodeCustom(planner)

  return encodeFunctionData({
    abi: CLPositionManagerAbi,
    functionName: 'modifyLiquidities',
    args: [calls, deadline],
  })
}

if (require.main === module) {
  const poolCandidate = getPoolCandidatesByTokens(TRX_ADDRESS, SUN_ADDRESS)[0]
  burnPosition(poolCandidate, 1n).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
