// TronWeb Permit2 Testing Script
// Install dependencies: npm install --save-dev tronweb @types/node ts-node --legacy-peer-deps
import { TronWeb } from 'tronweb'
import * as dotenv from 'dotenv'
import { generatePermitTypedData, getPermit2Address } from '@pancakeswap/permit2-sdk'
import { AllowanceTransfer } from '@pancakeswap/permit2-sdk'
import { Token } from '@pancakeswap/swap-sdk-core'
import { Address, privateKeyToAccount } from 'viem/accounts'
import { encodeFunctionData, Hex } from 'viem'
import { Permit2ForwardAbi } from '@pancakeswap/infinity-sdk'
import { SUN_ADDRESS } from './address'
import { toEvmHex } from './context'
import { getCurrentAllowance } from './getPermit2Allowance'

// Load environment variables
dotenv.config()

// Initialize TronWeb instance
const tronWeb = new TronWeb(
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  process.env.PRIVATE_KEY
)

// Configuration
const PERMIT2_ADDRESS = 'TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h'
const TOKEN_ADDRESS = SUN_ADDRESS
const SPENDER_ADDRESS = 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6' // The address you want to test as spender
const TOKEN_DECIMALS = 18
const AMOUNT = '10' // Amount to permit and transfer

// Permit2 ABI for testing (based on the user's ABI)
const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'permit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'permitSingle', type: 'tuple' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'transferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'token', type: 'address' },
    ],
    outputs: [],
  },
]

// Helper function to convert Tron address to EVM hex
function toEthHex20(addr: string): string {
  const hex = tronWeb.address.toHex(addr)
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return '0x' + body
}

// Helper function to convert human amount to raw amount
function toRawAmount(human: string, decimals: number): bigint {
  return BigInt(parseFloat(human) * Math.pow(10, decimals))
}

// Helper function to convert raw amount to human amount
function toHumanAmount(raw: bigint, decimals: number): string {
  return (Number(raw) / Math.pow(10, decimals)).toFixed(decimals)
}

// Function to generate permit signature using TronWeb
export async function generatePermitSignature(
  ownerAddress: string,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  deadline: number,
  sigDeadline: string
): Promise<{ signature: string; permitSingle: any }> {
  try {
    console.log('✍️ Generating permit signature...')

    const allowance = await getCurrentAllowance(
      ownerAddress as `0x${string}`,
      tokenAddress as `0x${string}`,
      spenderAddress as `0x${string}`
    )
    const nonce = allowance ? allowance.nonce : 0

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
        token: tokenAddress,
        amount: amount.toString(),
        expiration: deadline.toString(),
        nonce: nonce.toString(),
      },
      spender: spenderAddress,
      sigDeadline: sigDeadline,
    }

    const permitSingle = [
      [tokenAddress, amount.toString(), deadline.toString(), nonce.toString()],
      spenderAddress,
      sigDeadline,
    ]
    console.log('permitSingle1', JSON.stringify(permitSingle1, null, 2))
    // 检查所有字段都不为 undefined
    console.log('permitSingle', JSON.stringify(permitSingle, null, 2))

    // 5. 生成签名
    const signature = await tronWeb.trx._signTypedData(domain, types, permitSingle1)

    console.log('✅ Permit signature generated', signature)
    return { signature, permitSingle: permitSingle1 }
  } catch (error: any) {
    console.error('❌ Failed to generate permit signature:', error.message)
    throw error
  }
}

// Function to call permit function in Permit2
async function callPermitFunction(ownerAddress: string, permitSingle: any, signature: string) {
  try {
    console.log('🔐 Calling permit function in Permit2...')

    const functionSelector = 'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)'

    // Create permitSingle tuple
    // const permitSingle = [
    //   { type: 'address', value: tokenAddress },
    //   { type: 'uint160', value: amount.toString() },
    //   { type: 'uint48', value: deadline.toString() },
    //   { type: 'uint48', value: nonce.toString() },
    // ]

    const parameter = [
      { type: 'address', value: ownerAddress },
      {
        type: '((address,uint160,uint48,uint48),address,uint256)',
        value: permitSingle,
      },
      { type: 'bytes', value: signature },
    ]

    const result = await tronWeb.transactionBuilder.triggerSmartContract(
      PERMIT2_ADDRESS,
      functionSelector,
      {
        feeLimit: 100_000_000, // 100 TRX fee limit
        callValue: 0,
      },
      parameter,
      tronWeb.defaultAddress.base58 as string
    )

    if (result.result && result.result.result) {
      console.log('✅ Permit transaction built successfully!')

      const signedTransaction = await tronWeb.trx.sign(result.transaction)
      const broadcast = await tronWeb.trx.sendRawTransaction(signedTransaction)

      console.log('🔗 Permit Transaction Hash:', broadcast.txid)

      // Wait for confirmation
      await new Promise((resolve) => setTimeout(resolve, 3000))

      try {
        const txInfo = await tronWeb.trx.getTransactionInfo(broadcast.txid)
        console.log('📊 Permit Transaction Info:', {
          blockNumber: txInfo.blockNumber,
          fee: txInfo.fee,
          energyUsed: txInfo.receipt?.energy_usage_total || 0,
          result: txInfo.receipt?.result || 'SUCCESS',
        })
      } catch (infoError: any) {
        console.log('⚠️ Could not fetch permit transaction details:', infoError.message)
      }

      return broadcast.txid
    } else {
      console.error('❌ Failed to build permit transaction:', result)
      return null
    }
  } catch (error: any) {
    console.error('❌ Permit call failed:', error.message)
    return null
  }
}

// Function to test transferFrom using Permit2
async function testTransferFromWithPermit2(
  userAddress: string,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  recipientAddress: string
) {
  try {
    console.log('💸 Testing transferFrom with Permit2...')

    const functionSelector = 'transferFrom(address,address,uint160,address)'

    const parameter = [
      { type: 'address', value: userAddress },
      { type: 'address', value: recipientAddress },
      { type: 'uint160', value: amount.toString() },
      { type: 'address', value: tokenAddress },
    ]

    const tronWeb2 = new TronWeb(
      'https://nile.trongrid.io',
      'https://nile.trongrid.io',
      'https://nile.trongrid.io',
      process.env.PRIVATE_KEY_2
    )

    const result = await tronWeb2.transactionBuilder.triggerSmartContract(
      PERMIT2_ADDRESS,
      functionSelector,
      {
        feeLimit: 100_000_000, // 100 TRX fee limit
        callValue: 0,
      },
      parameter,
      tronWeb2.defaultAddress.base58 as string // This should be the spender's address
    )

    if (result.result && result.result.result) {
      console.log('✅ TransferFrom transaction built successfully!')

      // Note: This transaction needs to be signed by the spender, not the user
      // In a real scenario, the spender would sign this transaction
      console.log('📝 Note: This transaction needs to be signed by the spender address')
      console.log('🔑 Spender address:', spenderAddress)

      return result.transaction
    } else {
      console.error('❌ Failed to build transferFrom transaction:', result)
      return null
    }
  } catch (error: any) {
    console.error('❌ TransferFrom failed:', error.message)
    return null
  }
}

// Main test function
async function testPermit2Flow() {
  try {
    console.log('🚀 Starting Permit2 test on Nile testnet...')
    console.log('📍 Permit2 Contract Address:', PERMIT2_ADDRESS)
    console.log('📍 Token Address:', TOKEN_ADDRESS)
    console.log('📍 Spender Address:', SPENDER_ADDRESS)
    console.log('📍 User Address:', tronWeb.defaultAddress.base58)

    if (!PERMIT2_ADDRESS || !TOKEN_ADDRESS || !SPENDER_ADDRESS) {
      throw new Error('Missing required environment variables: PERMIT2_ADDRESS, TOKEN_ADDRESS, or SPENDER_ADDRESS')
    }

    const userAddress = toEthHex20(tronWeb.defaultAddress.base58 as string)
    const tokenAddress = toEthHex20(TOKEN_ADDRESS)
    const spenderAddress = toEthHex20(SPENDER_ADDRESS)
    const amount = toRawAmount(AMOUNT, TOKEN_DECIMALS)
    const deadline = Math.floor(Date.now() / 1000) + 36000 // 1 hour from now
    const sigDeadline = (Math.floor(Date.now() / 1000) + 3600).toString()

    console.log('📊 Test Parameters:')
    console.log('  User Address (EVM):', userAddress)
    console.log('  Token Address (EVM):', tokenAddress)
    console.log('  Spender Address (EVM):', spenderAddress)
    console.log('  Amount (Raw):', amount.toString())
    console.log('  Amount (Human):', AMOUNT)
    console.log('  Deadline:', new Date(deadline * 1000).toISOString())
    console.log('  Sig Deadline:', sigDeadline)

    // Step 2: Generate permit signature
    console.log('\n✍️ Step 2: Generating permit signature...')
    let { signature, permitSingle } = await generatePermitSignature(
      userAddress,
      tokenAddress,
      spenderAddress,
      amount,
      deadline,
      sigDeadline
    )

    if (!signature) {
      throw new Error('Failed to generate permit signature')
    }

    // Step 3: Call permit function
    console.log('\n🔐 Step 3: Calling permit function...')
    const permitTxId = await callPermitFunction(userAddress, permitSingle, signature)

    if (permitTxId) {
      console.log('✅ Permit transaction hash:', permitTxId)
      return
    } else {
      throw new Error('Failed to call permit function')
    }
  } catch (error: any) {
    console.error('❌ Permit2 test failed:', error)

    if (error.message) {
      console.error('💬 Error Message:', error.message)

      if (error.message.includes('insufficient balance')) {
        console.log('💡 Solution: Ensure you have enough TRX for gas fees')
      } else if (error.message.includes('invalid address')) {
        console.log('💡 Solution: Check that all addresses are valid')
      } else if (error.message.includes('contract not found')) {
        console.log('💡 Solution: Verify Permit2 contract address is correct')
      } else if (error.message.includes('InvalidSignature')) {
        console.log('💡 Solution: Check permit signature generation')
      } else if (error.message.includes('InvalidNonce')) {
        console.log('💡 Solution: Ensure nonce is correct and sequential')
      }
    }
  }
}

// Function to check token balance
async function checkTokenBalance(tokenAddress: string, userAddress: string) {
  try {
    console.log('💰 Checking token balance...')

    // This is a simplified balance check - you might need to adjust based on the token's ABI
    const functionSelector = 'balanceOf(address)'
    const parameter = [{ type: 'address', value: userAddress }]

    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      tokenAddress,
      functionSelector,
      {},
      parameter
    )

    if (result.result && result.constant_result && result.constant_result.length > 0) {
      const balance = parseInt(result.constant_result[0], 16)
      console.log('  Token Balance:', toHumanAmount(BigInt(balance), TOKEN_DECIMALS))
      return balance
    } else {
      console.log('⚠️ Could not fetch token balance')
      return 0
    }
  } catch (error: any) {
    console.error('❌ Failed to check token balance:', error.message)
    return 0
  }
}

// Run the test
if (require.main === module) {
  console.log('🔧 Permit2 Test Script')
  console.log('=====================')

  // Check token balance first
  checkTokenBalance(TOKEN_ADDRESS, tronWeb.defaultAddress.base58 as string)
    .then(() => {
      // Then run the main test
      return testPermit2Flow()
    })
    .catch((error) => {
      console.error('💥 Unhandled error:', error)
      process.exit(1)
    })
}

// Exports
export { testPermit2Flow, getCurrentAllowance, callPermitFunction, testTransferFromWithPermit2, checkTokenBalance }
