// TronWeb PoolManager Initialize Testing Script
// Install dependencies: npm install --save-dev tronweb @types/node ts-node --legacy-peer-deps
import {
  tronWeb,
  toEvmHex,
  ZERO_HEX_ADDRESS,
  encodeParameters,
  DEFAULT_FEE,
  DEFAULT_TICK_SPACING,
  parseConstantResult,
} from './context'
import { SUN_ADDRESS, TRX_ADDRESS, POOL_MANAGER_ADDRESS, CL_QUOTER_ADDRESS, USDC_ADDRESS } from './address'

async function testCLQuoter(): Promise<void> {
  const TOKEN0 = TRX_ADDRESS
  const TOKEN1 = USDC_ADDRESS

  let token0 = toEvmHex(TOKEN0)
  let token1 = toEvmHex(TOKEN1)
  if (token0.toLowerCase() >= token1.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
  }
  const poolManager = toEvmHex(POOL_MANAGER_ADDRESS)
  const amountIn = 100n
  const zeroForOne = true

  try {
    // Method 1: Use triggerSmartContract
    try {
      const functionSelector =
        'quoteExactInputSingle(((address,address,address,address,uint24,bytes32),bool,uint128,bytes))'

      // TronWeb parameter format
      const parameter = [
        {
          type: '((address,address,address,address,uint24,bytes32),bool,uint128,bytes)',
          value: [
            [token0, token1, ZERO_HEX_ADDRESS, poolManager, DEFAULT_FEE, encodeParameters(DEFAULT_TICK_SPACING)],
            zeroForOne,
            amountIn,
            '0x',
          ],
        },
      ]

      const resultQuote = await tronWeb.transactionBuilder.triggerConstantContract(
        CL_QUOTER_ADDRESS,
        functionSelector,
        {},
        parameter
      )

      if (resultQuote.result && resultQuote.constant_result && resultQuote.constant_result.length > 0) {
        console.log('resultQuote', resultQuote)

        // Parse the constant result based on ABI definition
        const parsed = parseConstantResult(resultQuote.constant_result[0], [
          { name: 'amountOut', type: 'uint256' },
          { name: 'gasEstimate', type: 'uint256' },
        ])

        console.log('📊 Parsed result:', parsed)
        console.log('💰 Amount Out:', parsed.amountOut.toString())
        console.log('⛽ Gas Estimate:', parsed.gasEstimate.toString())
      } else {
        console.log('⚠️  Could not fetch pool count')
      }

      return
    } catch (triggerError: any) {
      console.error('❌ Trigger smart contract failed:', triggerError.message)
    }

    console.log('🎉 Initialize test completed!')
  } catch (error: any) {
    console.error('❌ Initialize test failed:', error)

    // Common error messages and solutions
    if (error.message) {
      console.error('💬 Error Message:', error.message)

      if (error.message.includes('CurrenciesInitializedOutOfOrder')) {
        console.log('💡 Solution: Ensure currency0 < currency1 (addresses must be sorted)')
      } else if (error.message.includes('TickSpacingToo')) {
        console.log('💡 Solution: Use valid tick spacing (1-32767)')
      } else if (error.message.includes('LPFeeTooLarge')) {
        console.log('💡 Solution: Fee must be ≤ 1,000,000 (100%)')
      }
    }
  }
}

// Run the test
if (require.main === module) {
  // First check pool count
  testCLQuoter()
}
