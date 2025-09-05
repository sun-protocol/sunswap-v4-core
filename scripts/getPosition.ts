/*
    function positions(uint256 tokenId)
        external
        view
        returns (
            PoolKey memory poolKey,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            ICLSubscriber _subscriber
        )
    {
        */
import { tronWeb, parseConstantResult, DEFAULT_TICK_SPACING, DEFAULT_FEE, ZERO_HEX_ADDRESS, toEvmHex } from './context'
import { POSITION_MANAGER_ADDRESS, TRX_ADDRESS, SUN_ADDRESS } from './address'

export const getPosition = async (tokenId: bigint) => {
  const functionSelector = 'positions(uint256)'
  const parameter = [
    {
      type: 'uint256',
      value: tokenId,
    },
  ]
  const result = await tronWeb.transactionBuilder.triggerConstantContract(
    POSITION_MANAGER_ADDRESS,
    functionSelector,
    {},
    parameter
  )

  const parsed = parseConstantResult(result.constant_result[0], [
    {
      name: 'poolKey',
      type: 'tuple',
      components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'hooks', type: 'address' },
        { name: 'poolManager', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'parameters', type: 'bytes32' },
      ],
    },
    { name: 'tickLower', type: 'int24' },
    { name: 'tickUpper', type: 'int24' },
    { name: 'liquidity', type: 'uint128' },
    { name: 'feeGrowthInside0LastX128', type: 'uint256' },
    { name: 'feeGrowthInside1LastX128', type: 'uint256' },
    { name: '_subscriber', type: 'address' },
  ])

  console.log('\n📊 Parsed result:', parsed)
  return parsed
}

// test
if (require.main === module) {
  getPosition(17n).then((result) => {
    console.log(result)
  })
}
