import {
  tronWeb,
  parseConstantResult,
  DEFAULT_TICK_SPACING,
  DEFAULT_FEE,
  ZERO_HEX_ADDRESS,
  toEvmHex,
  getPoolCandidatesByTokens,
} from './context'
import { POOL_MANAGER_ADDRESS, TRX_ADDRESS, USDC_ADDRESS, USDT_ADDRESS } from './address'
import { PoolKey, getPoolId } from './action'
export const getPoolTickInfo = async (poolKey: string | PoolKey, tick: number) => {
  if (typeof poolKey !== 'string') {
    poolKey = getPoolId(poolKey) as `0x${string}`
  }

  console.log('poolKey', poolKey)

  const functionSelector = 'getPoolTickInfo(bytes32,int24)'
  const parameter = [
    {
      type: 'bytes32',
      value: poolKey,
    },
    {
      type: 'int24',
      value: tick,
    },
  ]
  const result = await tronWeb.transactionBuilder.triggerConstantContract(
    POOL_MANAGER_ADDRESS,
    functionSelector,
    {},
    parameter
  )

  console.log('result', result)

  // Parse the constant result based on ABI definition
  const parsed = parseConstantResult(result.constant_result[0], [
    { name: 'liquidityGross', type: 'uint128' },
    { name: 'liquidityNet', type: 'int128' },
    { name: 'feeGrowthOutside0X128', type: 'uint256' },
    { name: 'feeGrowthOutside1X128', type: 'uint256' },
  ])
  return parsed
}

// test
if (require.main === module) {
  const poolCandidate = getPoolCandidatesByTokens(USDT_ADDRESS, USDC_ADDRESS)[0]

  let currency0 = poolCandidate.token0Evm as `0x${string}`
  let currency1 = poolCandidate.token1Evm as `0x${string}`

  if (currency1 < currency0) {
    ;[currency0, currency1] = [currency1, currency0]
  }

  getPoolTickInfo(
    {
      currency0: currency0,
      currency1: currency1,
      hooks: poolCandidate.hook as `0x${string}`,
      fee: Number(poolCandidate.fee),
      parameters: { tickSpacing: poolCandidate.tickSpacing },
    },
    8000
  ).then((result) => {
    console.log(result)
  })
}
