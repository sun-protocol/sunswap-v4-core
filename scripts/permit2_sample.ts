import { toEvmHex, tronWeb } from './context'
import { PERMIT2_ADDRESS, POSITION_MANAGER_ADDRESS, SUN_ADDRESS } from './address'
import permit2Abi from './abi/permit2Abi.json'
const SPENDER_ADDRESS = 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6' // The address you want to test as spender
const testPermit2 = async () => {
  //getPool
  //   const permit2 = await tronWeb.contract(permit2Abi as any, PERMIT2_ADDRESS)

  // 3. 构造 PermitSingle

  const tokenv = toEvmHex(SUN_ADDRESS) // 转为 hex
  const amountv = '2234567890' // 用字符串
  const expirationv = (Math.floor(Date.now() / 1000) + 36000).toString()
  const noncev = '0'
  const spender = toEvmHex(SPENDER_ADDRESS) // 转为 hex
  const sigDeadline = (Math.floor(Date.now() / 1000) + 3600).toString()

  // 4. EIP712 域参数
  const domain = {
    name: 'Permit2',
    chainId: 3448148188,
    verifyingContract: toEvmHex(PERMIT2_ADDRESS),
  }

  const types = {
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
  }

  const permitSingle1 = {
    details: {
      token: tokenv,
      amount: amountv,
      expiration: expirationv,
      nonce: noncev,
    },
    spender: spender,
    sigDeadline: sigDeadline,
  }

  const permitSingle = [[tokenv, amountv, expirationv, noncev], spender, sigDeadline]
  // 检查所有字段都不为 undefined
  console.log('permitSingle1', JSON.stringify(permitSingle1, null, 2))
  console.log('permitSingle', JSON.stringify(permitSingle, null, 2))

  // 5. 生成签名
  const signature = await tronWeb.trx._signTypedData(domain, types, permitSingle1)
  // const result = await tronWeb.trx.verifyTypedData(domain, types, permitSingle, signature);

  const owner_addr = tronWeb.defaultAddress.base58

  // 6. 调用 Permit2.permit()

  const parameter = [
    {
      type: 'address',
      value: toEvmHex(owner_addr as string) as `0x${string}`,
    },
    {
      type: '((address,uint160,uint48,uint48),address,uint256)',
      value: permitSingle,
    },
    {
      type: 'bytes',
      value: signature as `0x${string}`,
    },
  ]

  //   struct PermitDetails {
  //     // ERC20 token address
  //     address token;
  //     // the maximum amount allowed to spend
  //     uint160 amount;
  //     // timestamp at which a spender's token allowances become invalid
  //     uint48 expiration;
  //     // an incrementing value indexed per owner,token,and spender for each signature
  //     uint48 nonce;
  // }

  // /// @notice The permit message signed for a single token allownce
  // struct PermitSingle {
  //     // the permit data for a single token alownce
  //     PermitDetails details;
  //     // address permissioned on the allowed tokens
  //     address spender;
  //     // deadline on the permit signature
  //     uint256 sigDeadline;
  // }
  const tx = await tronWeb.transactionBuilder.triggerSmartContract(
    PERMIT2_ADDRESS,
    'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)',
    {
      feeLimit: 100_000_000,
      callValue: 0,
    },
    parameter,
    tronWeb.defaultAddress.base58 as string
  )
  //   const tx = await permit2.permit(owner_addr, permitSingle, signature).send()

  console.log('Permit tx hash:', tx)

  const signedTx = await tronWeb.trx.sign(tx.transaction)
  const result = await tronWeb.trx.sendRawTransaction(signedTx)
  console.log('Transaction broadcasted!')
  console.log('TxID:', result.txid)
  console.log('Result:', result)
}

if (require.main === module) {
  testPermit2().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
