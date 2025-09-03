import { encodeCLPositionManagerDecreaseLiquidityCalldata } from '@pancakeswap/infinity-sdk'

import { TRX_ADDRESS, SUN_ADDRESS, POSITION_MANAGER_ADDRESS, POOL_MANAGER_ADDRESS } from './address'
import { tronWeb, toEvmHex, DEFAULT_TICK_SPACING, ZERO_HEX_ADDRESS, getEvmAccount, DEFAULT_FEE } from './context'
import { getPosition } from './getPosition'

// Usage in your test script
export const testDecreaseLiquidity = async () => {
  const account = getEvmAccount()

  let token0 = TRX_ADDRESS
  let token1 = SUN_ADDRESS
  let token0Evm = toEvmHex(token0)
  let token1Evm = toEvmHex(token1)
  let tokenId = 17n
  let liquidity = 0n

  const position = await getPosition(tokenId)

  liquidity = liquidity == 0n ? position.liquidity : liquidity

  if (token0Evm.toLowerCase() >= token1Evm.toLowerCase()) {
    ;[token0, token1] = [token1, token0]
    ;[token0Evm, token1Evm] = [token1Evm, token0Evm]
  }

  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  try {
    const multicallData = encodeCLPositionManagerDecreaseLiquidityCalldata({
      tokenId: tokenId,
      poolKey: {
        currency0: token0Evm as `0x${string}`,
        currency1: token1Evm as `0x${string}`,
        hooks: ZERO_HEX_ADDRESS,
        poolManager: toEvmHex(POOL_MANAGER_ADDRESS) as `0x${string}`,
        fee: Number(DEFAULT_FEE),
        parameters: {
          tickSpacing: DEFAULT_TICK_SPACING,
        },
      },
      liquidity: liquidity,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: account.address,
      hookData: '0x',
      deadline: BigInt(deadline),
    })

    console.log('Multicall data:', multicallData)

    // Broadcast the transaction on-chain
    const functionSelector = 'multicall(bytes[])'

    // Prepare parameters for the transaction
    const parameter = [
      {
        type: 'bytes[]',
        value: [multicallData],
      },
    ]

    // Build the transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      POSITION_MANAGER_ADDRESS,
      functionSelector,
      {
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

if (require.main === module) {
  testDecreaseLiquidity().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
