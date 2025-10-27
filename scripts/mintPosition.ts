import { Address } from 'viem/accounts'
import { encodeFunctionData, Hex } from 'viem'
import { Permit2Signature, Permit2ForwardAbi, encodeCLPoolParameters } from '@pancakeswap/infinity-sdk'

import {
  ActionsPlanner,
  ACTIONS,
  CLPositionConfig,
  EncodedCLPositionConfig,
  ACTION_CONSTANTS,
  CLPositionManagerAbi,
} from './action'
import {
  TickMath,
  maxLiquidityForAmount0Precise,
  maxLiquidityForAmount1,
  maxLiquidityForAmounts,
} from '@pancakeswap/v3-sdk'
import {
  TRX_ADDRESS,
  SUN_ADDRESS,
  POSITION_MANAGER_ADDRESS,
  POOL_MANAGER_ADDRESS,
  USDC_ADDRESS,
  WIN_ADDRESS,
  USDT_ADDRESS,
} from './address'
import {
  getEvmAccount,
  toEvmHex,
  tronWeb,
  ZERO_HEX_ADDRESS,
  alignToSpacing,
  toRawAmount,
  DEFAULT_TICK_SPACING,
  DEFAULT_FEE,
  parseConstantResult,
  DEFAULT_FEE_2,
  DEFAULT_TICK_SPACING_2,
  getPoolCandidatesByTokens,
} from './context'

import { getSlot0 } from './getSlot0'
import { PoolCandidate } from './types'
import { getPositionCount } from './getPositionCount'

// Usage in your test script
export const mintPosition = async (
  poolCandidate: PoolCandidate,
  token0Amount: number,
  token1Amount: number,
  skipTransfer?: boolean,
  tickLower?: number,
  tickUpper?: number
): Promise<bigint> => {
  const account = getEvmAccount()

  let token0 = poolCandidate.token0
  let token0Evm = toEvmHex(token0)
  let token0Decimals = poolCandidate.decimals0

  let token1 = poolCandidate.token1
  let token1Evm = toEvmHex(token1)
  let token1Decimals = poolCandidate.decimals1
  if (!tickLower) {
    tickLower = TickMath.MIN_TICK
  }
  if (!tickUpper) {
    tickUpper = TickMath.MAX_TICK
  }
  const fee = poolCandidate.fee
  const tickSpacing = poolCandidate.tickSpacing

  if (token0Evm.toLowerCase() >= token1Evm.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
    ;[token0Evm, token1Evm] = [token1Evm, token0Evm]
    ;[token0Amount, token1Amount] = [token1Amount, token0Amount]
    ;[token0Decimals, token1Decimals] = [token1Decimals, token0Decimals]
  }

  tickLower = alignToSpacing(tickLower, tickSpacing)
  tickUpper = alignToSpacing(tickUpper, tickSpacing)

  const amount0 = toRawAmount(token0Amount.toString(), token0Decimals)
  const amount1 = toRawAmount(token1Amount.toString(), token1Decimals)

  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  try {
    let token0Permit2Signature: Permit2Signature | null = null
    let token1Permit2Signature: Permit2Signature | null = null

    if (token0Evm != ZERO_HEX_ADDRESS && !skipTransfer) {
      await transfer(token0, amount0.toString(), toEvmHex(POSITION_MANAGER_ADDRESS) as `0x${string}`)
    }

    if (token1Evm != ZERO_HEX_ADDRESS && !skipTransfer) {
      await transfer(token1, amount1.toString(), toEvmHex(POSITION_MANAGER_ADDRESS) as `0x${string}`)
    }

    // const lastEditCurrency = 1 as number
    const sqrtPriceX96 = (
      await getSlot0({
        currency0: token0Evm as `0x${string}`,
        currency1: token1Evm as `0x${string}`,
        hooks: ZERO_HEX_ADDRESS,
        fee: Number(fee),
        parameters: { tickSpacing: tickSpacing },
      })
    ).sqrtPriceX96

    console.log('sqrtPriceX96', sqrtPriceX96)

    let liquidity = 0n
    // if (amount0 == '0' || amount1 == '0') {
    liquidity = maxLiquidityForAmounts(
      sqrtPriceX96,
      TickMath.getSqrtRatioAtTick(tickLower),
      TickMath.getSqrtRatioAtTick(tickUpper),
      amount0,
      amount1,
      true
    )
    // } else {
    //   const liquidityFromAmount0 = maxLiquidityForAmount0Precise(
    //     sqrtPriceX96,
    //     TickMath.getSqrtRatioAtTick(tickUpper),
    //     amount0
    //   )
    //   const liquidityFromAmount1 = maxLiquidityForAmount1(sqrtPriceX96, TickMath.getSqrtRatioAtTick(tickLower), amount1)
    //   liquidity = liquidityFromAmount0 < liquidityFromAmount1 ? liquidityFromAmount0 : liquidityFromAmount1
    // }
    console.log('amount0', amount0)
    console.log('amount1', amount1)
    console.log('tickLower', tickLower)
    console.log('tickUpper', tickUpper)
    console.log('tickSpacing', tickSpacing)
    console.log('fee', fee)
    console.log('token0Evm', token0Evm)
    console.log('token1Evm', token1Evm)
    console.log('token0Decimals', token0Decimals)
    console.log('token1Decimals', token1Decimals)
    console.log('liquidity', liquidity)

    const input = {
      sqrtPriceX96: 0n, // Your sqrt price
      positionConfig: {
        poolKey: {
          currency0: token0Evm,
          currency1: token1Evm,
          hooks: ZERO_HEX_ADDRESS,
          fee: fee,
          parameters: {
            tickSpacing: tickSpacing,
          },
        },
        tickLower: tickLower,
        tickUpper: tickUpper,
      },
      liquidity: liquidity, // Your liquidity amount
      owner: account.address,
      recipient: account.address,
      amount0Max: amount0,
      amount1Max: amount1,
      deadline: BigInt(deadline),
      modifyPositionHookData: ZERO_HEX_ADDRESS,
      token0Permit2Signature: token0Permit2Signature ?? undefined,
      token1Permit2Signature: token1Permit2Signature ?? undefined,
    }

    console.log('input', input)

    const multicallData = addCLLiquidityMulticall(input as any)

    console.log('Multicall data:', multicallData)

    /*
         {
            "outputs": [
                {
                    "name": "results",
                    "type": "bytes[]"
                }
            ],
            "inputs": [
                {
                    "name": "data",
                    "type": "bytes[]"
                }
            ],
            "name": "multicall",
            "stateMutability": "payable",
            "type": "function"
        },
    */

    // Broadcast the transaction on-chain
    const functionSelector = 'multicall(bytes[])'

    // Prepare parameters for the transaction
    const parameter = [
      {
        type: 'bytes[]',
        value: multicallData,
      },
    ]

    // Calculate callValue for native TRX payments
    let callValue = 0
    if (token0Evm === ZERO_HEX_ADDRESS) callValue += parseInt(amount0.toString())
    if (token1Evm === ZERO_HEX_ADDRESS) callValue += parseInt(amount1.toString())

    console.log('callValue', callValue)

    // Build the transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      POSITION_MANAGER_ADDRESS,
      functionSelector,
      {
        feeLimit: 500_000_000, // 500 TRX fee limit
        callValue: callValue,
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

    // Additional wait for position to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const tokenId = await getPositionCount()

    return tokenId
  } catch (error) {
    console.error('Error:', error)
    return 0n
  }
}

async function transfer(tokenAddr: string, amount: string, to: string) {
  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    tokenAddr,
    'transfer(address,uint256)',
    { feeLimit: 100_000_000, callValue: 0 },
    [
      { type: 'address', value: to as `0x${string}` },
      { type: 'uint256', value: amount },
    ]
  )
  if (built.result && built.result.result) {
    const signed = await tronWeb.trx.sign(built.transaction)
    const res = await tronWeb.trx.sendRawTransaction(signed)
    console.log('✅ Transfer transaction sent', res)
  }

  //sleep 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000))
}

const addCLLiquidityMulticall = ({
  sqrtPriceX96,
  positionConfig,
  liquidity,
  owner,
  recipient,
  amount0Max,
  amount1Max,
  deadline,
  modifyPositionHookData,
  token0Permit2Signature,
  token1Permit2Signature,
}: {
  sqrtPriceX96: bigint
  positionConfig: CLPositionConfig
  liquidity: bigint
  owner: Address
  recipient: Address
  amount0Max: bigint
  amount1Max: bigint
  deadline: bigint
  modifyPositionHookData: Hex
  token0Permit2Signature?: Permit2Signature
  token1Permit2Signature?: Permit2Signature
}) => {
  const calls: Hex[] = []

  // if (!isInitialized) {
  //   calls.push(encodeCLPositionManagerInitializePoolCalldata(positionConfig.poolKey, sqrtPriceX96))
  // }
  if (token0Permit2Signature) {
    calls.push(encodePermit2(owner, token0Permit2Signature))
  } else {
    console.log('token0Permit2Signature is not provided')
  }

  if (token1Permit2Signature) {
    calls.push(encodePermit2(owner, token1Permit2Signature))
  } else {
    console.log('token1Permit2Signature is not provided')
  }

  // mint
  calls.push(
    encodeCLPositionManagerMintCalldata(
      positionConfig,
      liquidity,
      recipient,
      amount0Max,
      amount1Max,
      deadline,
      modifyPositionHookData
    )
  )

  return calls
}

export const encodePermit2 = (owner: Address, permit2Signature: Permit2Signature) => {
  const { signature, details, spender, sigDeadline } = permit2Signature
  const permitSingle = {
    details: {
      token: details.token as `0x${string}`,
      amount: BigInt(details.amount),
      expiration: Number(details.expiration),
      nonce: Number(details.nonce),
    },
    spender: spender as `0x${string}`,
    sigDeadline: BigInt(sigDeadline),
  }

  return encodeFunctionData({
    abi: Permit2ForwardAbi,
    functionName: 'permit',
    args: [owner, permitSingle, signature],
  })
}

export const encodeCLPositionManagerMintCalldata = (
  positionConfig: CLPositionConfig,
  liquidity: bigint,
  recipient: Address,
  amount0Max: bigint,
  amount1Max: bigint,
  deadline: bigint,
  hookData: Hex = '0x'
) => {
  const planner = new ActionsPlanner()
  if (!positionConfig.poolKey.hooks) {
    // eslint-disable-next-line no-param-reassign
    positionConfig.poolKey.hooks = ZERO_HEX_ADDRESS as `0x${string}`
  }

  const encodedPositionConfig: EncodedCLPositionConfig = {
    ...positionConfig,
    poolKey: {
      ...positionConfig.poolKey,
      parameters: encodeCLPoolParameters(positionConfig.poolKey.parameters),
    },
  }

  console.log('encodedPositionConfig', encodedPositionConfig)
  console.log('recipient', recipient)
  console.log('liquidity', liquidity)
  console.log('amount0Max', amount0Max)
  console.log('amount1Max', amount1Max)
  console.log('hookData', hookData)

  // [ACTIONS.CL_MINT_POSITION]: parseAbiParameters([
  //   'PositionConfig positionConfig, uint128 liquidity, uint128 amount0Max, uint128 amount1Max, address owner, bytes hookData',
  //   ...ABI_STRUCT_POSITION_CONFIG,
  // ]),

  planner.add(ACTIONS.CL_MINT_POSITION, [encodedPositionConfig, liquidity, amount0Max, amount1Max, recipient, hookData])

  planner.add(ACTIONS.SETTLE, [encodedPositionConfig.poolKey.currency0, ACTION_CONSTANTS.OPEN_DELTA, false])
  planner.add(ACTIONS.SETTLE, [encodedPositionConfig.poolKey.currency1, ACTION_CONSTANTS.OPEN_DELTA, false])

  if (encodedPositionConfig.poolKey.currency0 === ZERO_HEX_ADDRESS) {
    planner.add(ACTIONS.SWEEP, [encodedPositionConfig.poolKey.currency0, recipient])
  }
  if (encodedPositionConfig.poolKey.currency1 === ZERO_HEX_ADDRESS) {
    planner.add(ACTIONS.SWEEP, [encodedPositionConfig.poolKey.currency1, recipient])
  }
  const calls = planner.encode()

  return encodeFunctionData({
    abi: CLPositionManagerAbi,
    functionName: 'modifyLiquidities',
    args: [calls, deadline],
  })
}

if (require.main === module) {
  const poolCandidate = getPoolCandidatesByTokens(USDT_ADDRESS, USDC_ADDRESS)[0]
  mintPosition(poolCandidate, 100, 100, false, 8000, 9000)
    .then((tokenId) => {
      console.log('tokenId', tokenId)
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
