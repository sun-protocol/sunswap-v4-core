import { Address } from 'viem/accounts'
import { encodeFunctionData, Hex } from 'viem'
import {
  Permit2Signature,
  encodeCLPositionManagerInitializePoolCalldata,
  Permit2ForwardAbi,
  CLPositionConfig,
  encodeCLPoolParameters,
  CLPositionManagerAbi,
  ACTION_CONSTANTS,
  encodeCLPositionManagerIncreaseLiquidityCalldata,
  ActionsPlanner,
  EncodedCLPositionConfig,
  ACTIONS,
} from '@pancakeswap/infinity-sdk'

import { TickMath, maxLiquidityForAmounts } from '@pancakeswap/v3-sdk'
import { TRX_ADDRESS, SUN_ADDRESS, POSITION_MANAGER_ADDRESS, POOL_MANAGER_ADDRESS } from './address'
import {
  getEvmAccount,
  toEvmHex,
  tronWeb,
  ZERO_HEX_ADDRESS,
  alignToSpacing,
  toRawAmount,
  DEFAULT_TICK_SPACING,
  DEFAULT_FEE,
} from './context'

import { getSlot0 } from './getSlot0'

// Usage in your test script
export const testMintPosition = async () => {
  const account = getEvmAccount()

  let token0 = TRX_ADDRESS
  let token0Evm = toEvmHex(token0)
  let token0Decimals = 6
  let token0Amount = 100n
  let token1 = SUN_ADDRESS
  let token1Evm = toEvmHex(token1)
  let token1Decimals = 18
  let token1Amount = 100n
  let tickLower = TickMath.MIN_TICK
  let tickUpper = TickMath.MAX_TICK

  if (token0Evm.toLowerCase() >= token1Evm.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
    ;[token0Evm, token1Evm] = [token1Evm, token0Evm]
    ;[token0Amount, token1Amount] = [token1Amount, token0Amount]
    ;[token0Decimals, token1Decimals] = [token1Decimals, token0Decimals]
  }

  tickLower = alignToSpacing(tickLower, DEFAULT_TICK_SPACING)
  tickUpper = alignToSpacing(tickUpper, DEFAULT_TICK_SPACING)

  const amount0 = toRawAmount(token0Amount.toString(), token0Decimals)
  const amount1 = toRawAmount(token1Amount.toString(), token1Decimals)

  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  try {
    let token0Permit2Signature: Permit2Signature | null = null
    let token1Permit2Signature: Permit2Signature | null = null

    if (token0Evm != ZERO_HEX_ADDRESS) {
      await transfer(token0, amount0.toString(), toEvmHex(POSITION_MANAGER_ADDRESS) as `0x${string}`)
    }

    if (token1Evm != ZERO_HEX_ADDRESS) {
      await transfer(token1, amount1.toString(), toEvmHex(POSITION_MANAGER_ADDRESS) as `0x${string}`)
    }

    // const lastEditCurrency = 1 as number
    const sqrtPriceX96 = (
      await getSlot0({
        currency0: token0Evm as `0x${string}`,
        currency1: token1Evm as `0x${string}`,
        hooks: ZERO_HEX_ADDRESS,
        poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
        fee: Number(DEFAULT_FEE),
        parameters: { tickSpacing: DEFAULT_TICK_SPACING },
      })
    ).sqrtPriceX96

    console.log('sqrtPriceX96', sqrtPriceX96)

    let liquidity = maxLiquidityForAmounts(
      sqrtPriceX96,
      TickMath.getSqrtRatioAtTick(tickLower),
      TickMath.getSqrtRatioAtTick(tickUpper),
      amount0,
      amount1,
      true
    )

    console.log('liquidity', liquidity)

    const tokenId = 0n

    const input = {
      tokenId: tokenId,
      isInitialized: true,
      sqrtPriceX96: 0n, // it could be 0n in this case
      positionConfig: {
        poolKey: {
          currency0: token0Evm,
          currency1: token1Evm,
          hooks: ZERO_HEX_ADDRESS,
          poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
          fee: DEFAULT_FEE,
          parameters: {
            tickSpacing: DEFAULT_TICK_SPACING,
          },
          /* your pool key */
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

    console.log('transaction', transaction)

    const signedTx = await tronWeb.trx.sign(transaction.transaction)

    const result = await tronWeb.trx.sendRawTransaction(signedTx)

    console.log('Transaction broadcasted!')
    console.log('TxID:', result.txid)
    console.log('Result:', result)
  } catch (error) {
    console.error('Error:', error)
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

export const addCLLiquidityMulticall = ({
  isInitialized,
  sqrtPriceX96,
  tokenId,
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
  isInitialized: boolean
  sqrtPriceX96: bigint
  tokenId?: bigint
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

  if (!isInitialized) {
    calls.push(encodeCLPositionManagerInitializePoolCalldata(positionConfig.poolKey, sqrtPriceX96))
  }
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
  if (typeof tokenId === 'undefined') {
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
  } else {
    // increase liquidity
    calls.push(
      encodeCLPositionManagerIncreaseLiquidityCalldata(
        tokenId,
        positionConfig,
        liquidity,
        amount0Max,
        amount1Max,
        modifyPositionHookData,
        deadline
      )
    )
  }

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

  planner.add(ACTIONS.CL_MINT_POSITION, [encodedPositionConfig, liquidity, amount0Max, amount1Max, recipient, hookData])

  console.log('encodedPositionConfig', encodedPositionConfig)
  planner.add(ACTIONS.SETTLE, [encodedPositionConfig.poolKey.currency0, ACTION_CONSTANTS.OPEN_DELTA, false])
  planner.add(ACTIONS.SETTLE, [encodedPositionConfig.poolKey.currency1, ACTION_CONSTANTS.OPEN_DELTA, false])

  if (encodedPositionConfig.poolKey.currency0 === ZERO_HEX_ADDRESS) {
    planner.add(ACTIONS.SWEEP, [encodedPositionConfig.poolKey.currency0, recipient])
  }
  const calls = planner.encode()

  return encodeFunctionData({
    abi: CLPositionManagerAbi,
    functionName: 'modifyLiquidities',
    args: [calls, deadline],
  })
}

if (require.main === module) {
  testMintPosition().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
