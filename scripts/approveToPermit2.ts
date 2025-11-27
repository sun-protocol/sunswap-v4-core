import { PERMIT2_ADDRESS, USDC_ADDRESS } from './address'
import { tronWeb, toEvmHex } from './context'

export const approveToPermit2 = async (tokenAddressBase58: string, amount: bigint) => {
  const approveTx = await tronWeb.transactionBuilder.triggerSmartContract(
    tokenAddressBase58,
    'approve(address,uint256)',
    {
      feeLimit: 100000000,
      callValue: 0,
    },
    [
      {
        type: 'address',
        value: toEvmHex(PERMIT2_ADDRESS),
      },
      {
        type: 'uint256',
        value: amount.toString(),
      },
    ]
  )

  if (approveTx.result && approveTx.result.result) {
    const signed = await tronWeb.trx.sign(approveTx.transaction)
    const res = await tronWeb.trx.sendRawTransaction(signed)
    console.log('✅ Approve transaction sent', res)
  }
}

if (require.main === module) {
  approveToPermit2(USDC_ADDRESS, 100000000n).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
