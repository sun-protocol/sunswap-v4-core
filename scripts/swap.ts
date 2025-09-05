import { Hex, Address } from 'viem'
import {
  EncodedPoolKey,
  PoolKey,
  encodeCLPoolParameters,
  ACTION_CONSTANTS,
  ActionsPlanner,
  ACTIONS,
} from '@pancakeswap/infinity-sdk'

import { TRX_ADDRESS, SUN_ADDRESS, POOL_MANAGER_ADDRESS, UNIVERSAL_ROUTER_ADDRESS } from './address'
import {
  tronWeb,
  toEvmHex,
  getEvmAccount,
  ZERO_HEX_ADDRESS,
  DEFAULT_FEE,
  DEFAULT_TICK_SPACING,
  DEFAULT_DEADLINE,
} from './context'

// Usage in your test script
export const testSwap = async () => {
  const account = getEvmAccount()

  let token0 = TRX_ADDRESS
  let token1 = SUN_ADDRESS

  let token0Evm = toEvmHex(token0)
  let token1Evm = toEvmHex(token1)

  if (token0Evm.toLowerCase() >= token1Evm.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
    ;[token0Evm, token1Evm] = [token1Evm, token0Evm]
  }

  const zeroForOne = true
  const amount = 100n

  try {
    const inputData = encodeUniversalRouterSwapCalldataFinalize(
      {
        currency0: token0Evm as `0x${string}`,
        currency1: token1Evm as `0x${string}`,
        hooks: ZERO_HEX_ADDRESS,
        poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
        fee: Number(DEFAULT_FEE),
        parameters: {
          tickSpacing: DEFAULT_TICK_SPACING,
        },
      },
      amount,
      account.address,
      '0x',
      zeroForOne
    )

    if (zeroForOne && token0Evm !== ZERO_HEX_ADDRESS) {
      await transfer(token0, amount.toString())
    }
    if (!zeroForOne && token1Evm !== ZERO_HEX_ADDRESS) {
      await transfer(token1, amount.toString())
    }

    console.log('Input data:', inputData)

    let commands: `0x${string}` = '0x'
    const inputs: `0x${string}`[] = [inputData]
    const InfyCommand = 0x12
    commands = commands.concat(InfyCommand.toString(16).padStart(2, '0')) as Hex

    const token0IsNative = token0Evm === ZERO_HEX_ADDRESS
    const token1IsNative = token1Evm === ZERO_HEX_ADDRESS

    let callValue = zeroForOne ? (token0IsNative ? amount : 0) : token1IsNative ? amount : 0n

    console.log('callValue', callValue)

    const functionSelector = 'execute(bytes,bytes[],uint256)'

    const parameter = [
      { type: 'bytes', value: commands },
      { type: 'bytes[]', value: inputs },
      { type: 'uint256', value: DEFAULT_DEADLINE },
    ]

    // Build the transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      UNIVERSAL_ROUTER_ADDRESS,
      functionSelector,
      {
        callValue: Number(callValue),
        feeLimit: 500_000_000, // 500 TRX fee limit
      },
      parameter,
      undefined
    )

    const signedTx = await tronWeb.trx.sign(transaction.transaction)

    const result = await tronWeb.trx.sendRawTransaction(signedTx)

    console.log('Transaction broadcasted!')
    console.log('TxID:', result.txid)
    console.log('Result:', result)
  } catch (error) {
    console.error('Error:', error)
  }
}

export const encodeUniversalRouterSwapCalldataFinalize = (
  poolKey: PoolKey<'CL'>,
  amountIn: bigint,
  recipient: Address,
  hookData: Hex = '0x',
  zeroForOne: boolean
) => {
  const planner = new ActionsPlanner()
  if (!poolKey.hooks) {
    // eslint-disable-next-line no-param-reassign
    poolKey.hooks = ZERO_HEX_ADDRESS as `0x${string}`
  }

  const encodedPoolKey: EncodedPoolKey = {
    currency0: poolKey.currency0,
    currency1: poolKey.currency1,
    hooks: poolKey.hooks,
    poolManager: poolKey.poolManager,
    fee: poolKey.fee,
    parameters: encodeCLPoolParameters(poolKey.parameters),
  }

  const swapParams = {
    poolKey: encodedPoolKey,
    zeroForOne: zeroForOne,
    amountIn: amountIn,
    amountOutMinimum: 0n,
    hookData: hookData,
  }

  planner.add(ACTIONS.CL_SWAP_EXACT_IN_SINGLE, [swapParams])

  planner.add(ACTIONS.SETTLE, [zeroForOne ? poolKey.currency0 : poolKey.currency1, ACTION_CONSTANTS.OPEN_DELTA, false])
  planner.add(ACTIONS.TAKE, [
    zeroForOne ? poolKey.currency1 : poolKey.currency0,
    recipient,
    ACTION_CONSTANTS.OPEN_DELTA,
  ])

  const calls = planner.encode()

  return calls
}

async function transfer(tokenAddr: string, amount: string) {
  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    tokenAddr,
    'transfer(address,uint256)',
    { feeLimit: 100_000_000, callValue: 0 },
    [
      { type: 'address', value: toEvmHex(UNIVERSAL_ROUTER_ADDRESS) as `0x${string}` },
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

if (require.main === module) {
  testSwap().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
