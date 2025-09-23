import { tronWeb, parseConstantResult, DEFAULT_TICK_SPACING, DEFAULT_FEE, ZERO_HEX_ADDRESS, toEvmHex } from './context'
import { POOL_MANAGER_ADDRESS, TRX_ADDRESS, USDC_ADDRESS } from './address'
import { getPoolId, PoolKey } from '@pancakeswap/infinity-sdk'

export const getSlot0 = async (poolKey: string | PoolKey<'CL'>) => {
  if (typeof poolKey !== 'string') {
    poolKey = getPoolId(poolKey) as `0x${string}`
  }

  // "getSlot0", "bytes32", "uint160,int24,uint24,uint24"
  const functionSelector = 'getLiquidity(bytes32) '
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
  return parsed
}

// test
if (require.main === module) {
  getSlot0({
    currency0: toEvmHex(TRX_ADDRESS) as `0x${string}`,
    currency1: toEvmHex(USDC_ADDRESS) as `0x${string}`,
    hooks: ZERO_HEX_ADDRESS,
    poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
    fee: Number(DEFAULT_FEE),
    parameters: { tickSpacing: DEFAULT_TICK_SPACING },
  }).then((result) => {
    console.log(result)
  })
}
