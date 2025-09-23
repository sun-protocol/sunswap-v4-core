import { tronWeb } from './context'
import { PERMIT2_ADDRESS, SUN_ADDRESS, UNIVERSAL_ROUTER_ADDRESS } from './address'
import { toEvmHex } from './context'

// Function to get current allowance and nonce from Permit2
export async function getCurrentAllowance(
  userAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`
) {
  try {
    const functionSelector = 'allowance(address,address,address)'
    const parameter = [
      { type: 'address', value: userAddress },
      { type: 'address', value: tokenAddress },
      { type: 'address', value: spenderAddress },
    ]

    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      PERMIT2_ADDRESS,
      functionSelector,
      {},
      parameter
    )

    if (result.result && result.constant_result && result.constant_result.length > 0) {
      const hexResult = result.constant_result[0]
      const hexData = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult

      // Each value is 32 bytes (64 hex chars)
      const amountHex = '0x' + hexData.slice(0, 64)
      const expirationHex = '0x' + hexData.slice(64, 128)
      const nonceHex = '0x' + hexData.slice(128, 192)

      const amount = parseInt(amountHex, 16)
      const expiration = parseInt(expirationHex, 16)
      const nonce = parseInt(nonceHex, 16)

      return { amount, expiration, nonce }
    }
    return null
  } catch (error) {
    console.error('Error getting allowance:', error)
    return null
  }
}

if (require.main === module) {
  getCurrentAllowance(
    tronWeb.defaultAddress.hex as `0x${string}`,
    toEvmHex(SUN_ADDRESS) as `0x${string}`,
    toEvmHex(UNIVERSAL_ROUTER_ADDRESS) as `0x${string}`
  ).then((result) => {
    console.log(result)
  })
}
