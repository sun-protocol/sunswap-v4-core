import { tronWeb, parseConstantResult, DEFAULT_TICK_SPACING, DEFAULT_FEE, ZERO_HEX_ADDRESS, toEvmHex } from './context'
import { POSITION_MANAGER_ADDRESS, TRX_ADDRESS, SUN_ADDRESS } from './address'

export const getPositionCount = async (): Promise<bigint> => {
  const functionSelector = 'nextTokenId()'
  const result = await tronWeb.transactionBuilder.triggerConstantContract(
    POSITION_MANAGER_ADDRESS,
    functionSelector,
    {},
    []
  )

  const parsed = parseConstantResult(result.constant_result[0], [{ name: 'nextTokenId', type: 'uint256' }])

  console.log('\n📊 Parsed result:', parsed)
  return BigInt(parsed.nextTokenId)
}

// test
if (require.main === module) {
  getPositionCount().then((result) => {
    console.log(result)
  })
}
