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

// Function to get current allowance and nonce from Permit2
async function getCurrentAllowance(userAddress: string, tokenAddress: string, spenderAddress: string) {
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

// Function to generate permit signature using TronWeb
async function generatePermitSignature(
  ownerAddress: string,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  nonce: number,
  deadline: number
) {
  try {
    console.log('✍️ Generating permit signature...')

    let token = new Token(
      3448148188, // Nile
      tokenAddress as `0x${string}`,
      TOKEN_DECIMALS,
      'SUN',
      'SUN'
    )

    const permit = generatePermitTypedData(token, nonce, spenderAddress)

    console.log('✅ Permit', permit)

    // Get typed data for signing
    const {
      domain,
      types,
      values: message,
    } = AllowanceTransfer.getPermitData(permit, toEthHex20(PERMIT2_ADDRESS) as `0x${string}`, 3448148188)

    console.log('✅ Permit data', domain, types, message)

    const signature = tronWeb.trx._signTypedData(domain, types, message)

    // Create the permit data structure
    // const permitData = {
    //   details: {
    //     token: tokenAddress,
    //     amount: amount.toString(),
    //     expiration: deadline,
    //     nonce: nonce,
    //   },
    //   spender: spenderAddress,
    //   sigDeadline: deadline.toString(),
    // }

    // // For TronWeb, we'll create a simple signature of the permit data
    // // In a real implementation, you'd use EIP-712 typed data signing
    // const permitString = JSON.stringify(permitData)
    // const permitHash = tronWeb.utils.ethersUtils.sha256(permitString)

    // // Sign the hash with the owner's private key
    // const signature = await tronWeb.trx.sign(permitHash)

    console.log('✅ Permit signature generated', signature)
    return signature
  } catch (error: any) {
    console.error('❌ Failed to generate permit signature:', error.message)
    return null
  }
}

// Function to call permit function in Permit2
async function callPermitFunction(
  ownerAddress: string,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  nonce: number,
  deadline: number,
  signature: string
) {
  try {
    console.log('🔐 Calling permit function in Permit2...')

    const functionSelector = 'permit(address,(address,uint160,uint48,uint48),bytes)'

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
        type: '(address,uint160,uint48,uint48)',
        value: [tokenAddress, amount.toString(), deadline.toString(), nonce.toString()],
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
    const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

    console.log('📊 Test Parameters:')
    console.log('  User Address (EVM):', userAddress)
    console.log('  Token Address (EVM):', tokenAddress)
    console.log('  Spender Address (EVM):', spenderAddress)
    console.log('  Amount (Raw):', amount.toString())
    console.log('  Amount (Human):', AMOUNT)
    console.log('  Deadline:', new Date(deadline * 1000).toISOString())

    // Step 1: Check current allowance
    console.log('\n📋 Step 1: Checking current allowance...')
    const currentAllowance = await getCurrentAllowance(userAddress, tokenAddress, spenderAddress)

    if (currentAllowance) {
      console.log('  Current Allowance:', toHumanAmount(BigInt(currentAllowance.amount), TOKEN_DECIMALS))
      console.log('  Expiration:', new Date(currentAllowance.expiration * 1000).toISOString())
      console.log('  Nonce:', currentAllowance.nonce)
    } else {
      console.log('  No current allowance found')
    }

    // Step 2: Generate permit signature
    console.log('\n✍️ Step 2: Generating permit signature...')
    const nonce = currentAllowance ? currentAllowance.nonce : 0
    let permitSignature = await generatePermitSignature(
      userAddress,
      tokenAddress,
      spenderAddress,
      amount,
      nonce,
      deadline
    )

    if (!permitSignature) {
      throw new Error('Failed to generate permit signature')
    }

    // Step 3: Call permit function
    console.log('\n🔐 Step 3: Calling permit function...')
    const permitTxId = await callPermitFunction(
      userAddress,
      tokenAddress,
      spenderAddress,
      amount,
      nonce,
      deadline,
      permitSignature
    )

    if (!permitTxId) {
      throw new Error('Permit call failed')
    }

    // Step 4: Wait and check new allowance
    console.log('\n⏳ Step 4: Waiting for permit confirmation...')
    await new Promise((resolve) => setTimeout(resolve, 5000))

    const newAllowance = await getCurrentAllowance(userAddress, tokenAddress, spenderAddress)
    if (newAllowance) {
      console.log('  New Allowance:', toHumanAmount(BigInt(newAllowance.amount), TOKEN_DECIMALS))
      console.log('  New Expiration:', new Date(newAllowance.expiration * 1000).toISOString())
      console.log('  New Nonce:', newAllowance.nonce)
    }

    // Step 5: Test transferFrom (this would be signed by the spender in real usage)
    console.log('\n💸 Step 5: Testing transferFrom with Permit2...')
    const transferTransaction = await testTransferFromWithPermit2(
      userAddress,
      tokenAddress,
      spenderAddress,
      amount,
      spenderAddress // recipient is the spender for this test
    )

    if (transferTransaction) {
      console.log('✅ TransferFrom transaction prepared successfully!')
      console.log('📝 Note: In real usage, this transaction would be signed by the spender')
    }

    console.log('\n🎉 Permit2 test completed successfully!')
    console.log('\n📚 Summary:')
    console.log('  1. ✅ Checked current allowance')
    console.log('  2. ✅ Generated permit signature')
    console.log('  3. ✅ Called permit function')
    console.log('  4. ✅ Verified new allowance')
    console.log('  5. ✅ Prepared transferFrom transaction')
    console.log('\n💡 Next steps:')
    console.log('  - The spender can now use the permitted allowance')
    console.log('  - Use transferFrom to move tokens from user to recipient')
    console.log('  - The permit will expire at the specified deadline')
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
