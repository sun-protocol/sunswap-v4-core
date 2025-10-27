import {
  tronWeb,
  parseConstantResult,
  DEFAULT_TICK_SPACING,
  DEFAULT_FEE,
  ZERO_HEX_ADDRESS,
  toEvmHex,
  POOL_CANDIDATES,
} from './context'
import { POOL_MANAGER_ADDRESS, WIN_ADDRESS, USDT_ADDRESS, TRX_ADDRESS, SUN_ADDRESS } from './address'
import { PoolKey, getPoolId } from './action'
import { PoolCandidate } from './types/poolCandidate'
export const getSlot0 = async (poolKey: string | PoolKey) => {
  if (typeof poolKey !== 'string') {
    poolKey = getPoolId(poolKey) as `0x${string}`
  }

  console.log('poolKey', poolKey)

  // "getSlot0", "bytes32", "uint160,int24,uint24,uint24"
  const functionSelector = 'getSlot0(bytes32) '
  const parameter = [
    {
      type: 'bytes32',
      value: poolKey,
    },
  ]
  const result = await tronWeb.transactionBuilder.triggerConstantContract(
    POOL_MANAGER_ADDRESS,
    functionSelector,
    {},
    parameter
  )

  // Parse the constant result based on ABI definition
  const parsed = parseConstantResult(result.constant_result[0], [
    { name: 'sqrtPriceX96', type: 'uint160' },
    { name: 'tick', type: 'int24' },
    { name: 'protocolFee', type: 'uint24' },
    { name: 'lpFee', type: 'uint24' },
  ])

  // return parsed with poolKey
  return parsed
}

export const getSlot0ByPoolCandidate = async (poolCandidate: PoolCandidate) => {
  const poolKeyRaw: PoolKey = {
    currency0: poolCandidate.token0Evm as `0x${string}`,
    currency1: poolCandidate.token1Evm as `0x${string}`,
    hooks: poolCandidate.hook as `0x${string}`,
    fee: Number(poolCandidate.fee),
    parameters: { tickSpacing: poolCandidate.tickSpacing },
  }

  const poolKey = getPoolId(poolKeyRaw) as `0x${string}`

  // console.log('========================================')
  // console.log('poolCandidate', poolCandidate)
  console.log('poolKey', poolKey)

  // "getSlot0", "bytes32", "uint160,int24,uint24,uint24"
  const functionSelector = 'getSlot0(bytes32) '
  const parameter = [
    {
      type: 'bytes32',
      value: poolKey,
    },
  ]
  const result = await tronWeb.transactionBuilder.triggerConstantContract(
    POOL_MANAGER_ADDRESS,
    functionSelector,
    {},
    parameter
  )

  // Parse the constant result based on ABI definition
  const parsed = parseConstantResult(result.constant_result[0], [
    { name: 'sqrtPriceX96', type: 'uint160' },
    { name: 'tick', type: 'int24' },
    { name: 'protocolFee', type: 'uint24' },
    { name: 'lpFee', type: 'uint24' },
  ])

  // return parsed with poolKey
  return parsed
}

// test
if (require.main === module) {
  // all candidates
  POOL_CANDIDATES.forEach(async (poolCandidate) => {
    const result = await getSlot0ByPoolCandidate(poolCandidate)
    console.log(poolCandidate.symbol0, poolCandidate.symbol1)
    console.log(result)
  })
}
