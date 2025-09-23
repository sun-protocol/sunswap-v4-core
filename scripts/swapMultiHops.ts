import { Hex, Address } from 'viem'
import {
  EncodedPoolKey,
  PoolKey,
  encodeCLPoolParameters,
  ACTION_CONSTANTS,
  ActionsPlanner,
  ACTIONS,
} from '@pancakeswap/infinity-sdk'

import {
  TRX_ADDRESS,
  SUN_ADDRESS,
  POOL_MANAGER_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS,
  USDC_ADDRESS,
  WIN_ADDRESS,
} from './address'
import {
  tronWeb,
  toEvmHex,
  getEvmAccount,
  ZERO_HEX_ADDRESS,
  DEFAULT_FEE,
  DEFAULT_TICK_SPACING,
  DEFAULT_DEADLINE,
  getPoolCandidatesByTokens,
  toRawAmount,
} from './context'
import { PoolCandidate, SwapStep } from './types'

const getMidCurrencyEvm = (step0: PoolCandidate, step1: PoolCandidate) => {
  if (step0.token0 == step1.token0 && step0.token1 == step1.token1) {
    throw new Error('Same step')
  }

  if (step0.token0 == step1.token0 || step0.token0 == step1.token1) {
    return step0.token0Evm
  }

  if (step0.token1 == step1.token0 || step0.token1 == step1.token1) {
    return step0.token1Evm
  }

  throw new Error('Invalid steps no mid currency')
}

// Usage in your test script
export const swapMultiHops = async (path: PoolCandidate[], currencyIn: string, amountInHuman: number) => {
  if (path.length < 2) {
    throw new Error('Path must have at least 2 steps')
  }

  if (path[0].token0 !== currencyIn && path[0].token1 !== currencyIn) {
    throw new Error('Currency in must be one of the first step tokens')
  }

  const amountIn = BigInt(
    toRawAmount(amountInHuman.toString(), path[0].token0 == currencyIn ? path[0].decimals0 : path[0].decimals1)
  )

  const account = getEvmAccount()

  let currencyInEvm = toEvmHex(currencyIn)

  // const firstStep: SwapStep = {
  //   intermediateCurrency: (path[0].token0 == currencyIn ? path[0].token1Evm : path[0].token0Evm) as `0x${string}`,
  //   fee: Number(path[0].fee),
  //   hooks: path[0].hook as `0x${string}`,
  //   poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
  //   hookData: '0x',
  //   parameters: { tickSpacing: path[0].tickSpacing },
  // }

  // skip the first step
  const pathSteps: SwapStep[] = path.map((step, index) => {
    const midCurrency =
      index === path.length - 1
        ? getMidCurrencyEvm(path[index - 1], step) === step.token0Evm
          ? step.token1Evm
          : step.token0Evm
        : getMidCurrencyEvm(step, path[index + 1])

    return {
      intermediateCurrency: midCurrency as `0x${string}`,
      fee: Number(step.fee),
      hooks: step.hook as `0x${string}`,
      poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
      hookData: '0x',
      parameters: { tickSpacing: step.tickSpacing },
    }
  })

  try {
    const inputData = encodeUniversalRouterSwapMultiHopsCalldataFinalize(
      currencyInEvm as `0x${string}`,
      amountIn,
      0n,
      pathSteps,
      account.address
    )

    if (currencyInEvm !== ZERO_HEX_ADDRESS) {
      await transfer(currencyIn, amountIn.toString())
    }

    console.log('Input data:', inputData)

    let commands: `0x${string}` = '0x'
    const inputs: `0x${string}`[] = [inputData]
    const InfyCommand = 0x12
    commands = commands.concat(InfyCommand.toString(16).padStart(2, '0')) as Hex

    const callValue = currencyInEvm === ZERO_HEX_ADDRESS ? amountIn : 0n

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

export const encodeUniversalRouterSwapMultiHopsCalldataFinalize = (
  currencyIn: `0x${string}`,
  amountIn: bigint,
  amountOutMinimum: bigint,
  path: SwapStep[],
  recipient: Address
) => {
  const planner = new ActionsPlanner()
  const lastStep = path[path.length - 1]

  /**
     *     struct CLSwapExactInputParams {
        Currency currencyIn;
        PathKey[] path;
        uint128 amountIn;
        uint128 amountOutMinimum;
    }
     * struct PathKey {
    Currency intermediateCurrency;
    uint24 fee;
    IHooks hooks;
    IPoolManager poolManager;
    bytes hookData;
    bytes32 parameters;
}
     */

  const swapParams = {
    currencyIn: currencyIn,
    amountIn: amountIn,
    amountOutMinimum: amountOutMinimum,
    path: [] as {
      intermediateCurrency: `0x${string}`
      fee: number
      hooks: `0x${string}`
      poolManager: `0x${string}`
      hookData: Hex
      parameters: `0x${string}`
    }[],
  }

  for (const step of path) {
    const path = {
      intermediateCurrency: step.intermediateCurrency,
      fee: step.fee,
      hooks: step.hooks as `0x${string}`,
      poolManager: step.poolManager,
      hookData: step.hookData,
      parameters: encodeCLPoolParameters(step.parameters),
    }

    swapParams.path.push(path)
  }

  planner.add(ACTIONS.CL_SWAP_EXACT_IN, [swapParams])

  planner.add(ACTIONS.SETTLE, [currencyIn, ACTION_CONSTANTS.OPEN_DELTA, false])
  planner.add(ACTIONS.TAKE, [lastStep.intermediateCurrency, recipient, ACTION_CONSTANTS.OPEN_DELTA])

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
  const path0 = getPoolCandidatesByTokens(USDC_ADDRESS, WIN_ADDRESS)[0]
  const path1 = getPoolCandidatesByTokens(SUN_ADDRESS, USDC_ADDRESS)[0]
  const path2 = getPoolCandidatesByTokens(TRX_ADDRESS, SUN_ADDRESS)[0]
  swapMultiHops([path0, path1, path2], WIN_ADDRESS, 100).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
