import { generatePermitTypedData, getPermit2Address } from '@pancakeswap/permit2-sdk'
import { AllowanceTransfer } from '@pancakeswap/permit2-sdk'
import { Token } from '@pancakeswap/swap-sdk-core'
import { Address, privateKeyToAccount, signTypedData } from 'viem/accounts'
import { encodeFunctionData, Hex } from 'viem'
import {
  Permit2Signature,
  addCLLiquidityMulticall as addCLLiquidityMulticallSDK,
  encodeCLPositionManagerInitializePoolCalldata,
  encodeCLPositionManagerMintCalldata,
  Permit2ForwardAbi,
  CLPositionConfig,
} from '@pancakeswap/infinity-sdk'
import { encodeCLPositionManagerIncreaseLiquidityCalldata } from '@pancakeswap/infinity-sdk'
import {
  encodeSqrtPriceX96,
  encodeSqrtPriceX96WithoutDecimals,
  sqrtPriceX96ToRealPriceWithoutDecimals,
} from './math/sqrtPriceX96'

import {
  TickMath,
  maxLiquidityForAmount0Precise,
  maxLiquidityForAmount1,
  maxLiquidityForAmounts,
} from '@pancakeswap/v3-sdk'
import { POOL_MANAGER_ADDRESS, SUN_ADDRESS, TRX_ADDRESS } from './address'
import { TronWeb } from 'tronweb'
import { createPoolKey } from './initialize'
import Decimal from 'decimal.js'
import * as dotenv from 'dotenv'
import { ContractAbiInterface } from 'tronweb/lib/esm/types'

dotenv.config()

const tronWeb = new TronWeb(
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  process.env.PRIVATE_KEY
)

const POSITION_MANAGER_ADDRESS = process.env.POSITION_MANAGER_ADDRESS || ''
const PERMIT2_ADDRESS = process.env.PERMIT2_ADDRESS || ''

// if TOKEN_ID is empty -> Mint mode; otherwise Increase-from-deltas mode
const TOKEN_ID = (process.env.TOKEN_ID || '').trim()

const NATIVE_HEX = '0x0000000000000000000000000000000000000000'
const TOKEN0 = process.env.TOKEN0 || TRX_ADDRESS
const TOKEN0_SYMBOL = process.env.TOKEN0_SYMBOL || 'TRX'
const TOKEN0_DECIMALS = parseInt(process.env.TOKEN0_DECIMALS || '6', 10)
const TOKEN0_AMOUNT = 100

const TOKEN1 = process.env.TOKEN1 || SUN_ADDRESS
const TOKEN1_SYMBOL = process.env.TOKEN1_SYMBOL || 'SUN'
const TOKEN1_DECIMALS = parseInt(process.env.TOKEN1_DECIMALS || '18', 10)
const TOKEN1_AMOUNT = 514071

// Desired deposit amounts (human units)
const DESIRED_AMOUNT0 = process.env.AMOUNT0 || '100'
const DESIRED_AMOUNT1 = process.env.AMOUNT1 || '514071'

// pool params
const hooks = '0x0000000000000000000000000000000000000000'
const fee = parseInt(process.env.POOL_FEE || '500', 10)
const tickSpacing = parseInt(process.env.TICK_SPACING || '10', 10)

function encodeParameters(tickSpacing: number): string {
  const shifted = tickSpacing << 16
  return '0x' + shifted.toString(16).padStart(64, '0')
}

// Function to generate permit2 signature for testing scripts
export const generatePermit2SignatureForScript = async (
  privateKeyHex: string,
  token: Token,
  spender: Address,
  amount: bigint,
  nonce: number,
  deadline: number,
  chainId: number
): Promise<Permit2Signature> => {
  // Convert private key to account
  // const account = privateKeyToAccount(privateKeyHex as `0x${string}`)

  // Get permit2 contract address
  //   const permit2Address = getPermit2Address(chainId)
  //   if (!permit2Address) {
  //     throw new Error(`Permit2 not deployed on chain ${chainId}`)
  //   }

  // Generate permit data
  const permit = generatePermitTypedData(token, nonce, spender)

  // Get typed data for signing
  const {
    domain,
    types,
    values: message,
  } = AllowanceTransfer.getPermitData(permit, toEthHex20(PERMIT2_ADDRESS) as `0x${string}`, chainId)

  let signature = tronWeb.trx._signTypedData(domain, types, message)

  // const tail = signature.substring(128, 130)
  // if (tail == '01') {
  //   signature = signature.substring(0, 128) + '1c'
  // } else if (tail == '00') {
  //   signature = signature.substring(0, 128) + '1b'
  // }

  const result = await tronWeb.trx.verifyTypedData(domain, types, message, signature)

  console.log('✅ Permit signature verified', result)

  // Sign the typed data with private key
  // const signature = await account.signTypedData({
  //   domain,
  //   primaryType: 'PermitSingle',
  //   types,
  //   message,
  // })

  // Return the complete permit2 signature
  return {
    details: {
      token: token.address,
      amount: amount.toString(),
      expiration: deadline,
      nonce: nonce,
    },
    spender: spender,
    sigDeadline: deadline.toString(),
    signature: signature as `0x${string}`,
  }
}

// Usage in your test script
export const testAddLiquidity = async () => {
  const PRIVATE_KEY = ('0x' + process.env.PRIVATE_KEY) as `0x${string}`
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`)

  let token0Raw = TOKEN0
  let token0Decimals = TOKEN0_DECIMALS
  let token0Amount = TOKEN0_AMOUNT
  let token1Raw = TOKEN1
  let token1Decimals = TOKEN1_DECIMALS
  let token1Amount = TOKEN1_AMOUNT
  let amount0Human = new Decimal(DESIRED_AMOUNT0)
  let amount1Human = new Decimal(DESIRED_AMOUNT1)

  // Test parameters
  let token0 = new Token(
    3448148188, // Nile
    toEthHex20(token0Raw) as `0x${string}`, // CAKE
    token0Decimals,
    TOKEN0_SYMBOL,
    TOKEN0_SYMBOL
  )

  let token1 = new Token(
    3448148188, // Nile
    toEthHex20(token1Raw) as `0x${string}`, // WBNB
    token1Decimals,
    TOKEN1_SYMBOL,
    TOKEN1_SYMBOL
  )

  if (token0Raw.toLowerCase() >= token1Raw.toLowerCase()) {
    token0Raw = TOKEN1
    token1Raw = TOKEN0
    token0Decimals = TOKEN1_DECIMALS
    token1Decimals = TOKEN0_DECIMALS
    token0Amount = TOKEN1_AMOUNT
    token1Amount = TOKEN0_AMOUNT
    ;[amount0Human, amount1Human] = [amount1Human, amount0Human]
    ;[token0, token1] = [token1, token0]
  }

  const poolKey = createPoolKey(token0Raw, token1Raw, hooks, POOL_MANAGER_ADDRESS, fee, tickSpacing)
  const tickLower = alignToSpacing(360000, tickSpacing)
  const tickUpper = alignToSpacing(361000, tickSpacing)

  const desired0Raw = toRawAmount(amount0Human.toFixed(), token0Decimals)
  const desired1Raw = toRawAmount(amount1Human.toFixed(), token1Decimals)

  const spender = POSITION_MANAGER_ADDRESS
  const amount0 = BigInt(desired0Raw.toFixed(0))
  const amount1 = BigInt(desired1Raw.toFixed(0))

  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  try {
    // const permit2 = tronWeb.contract(PERMIT2_ABI as ContractAbiInterface, toEthHex20(PERMIT2_ADDRESS) as `0x${string}`)
    const getNextNonce = async (accountAddress: string, tokenAddress: string) => {
      const functionSelector = 'allowance(address,address,address)'

      const parameter = [
        {
          type: 'address',
          value: accountAddress,
        },
        {
          type: 'address',
          value: tokenAddress,
        },
        {
          type: 'address',
          value: toEthHex20(POSITION_MANAGER_ADDRESS),
        },
      ]

      const result = await tronWeb.transactionBuilder.triggerConstantContract(
        PERMIT2_ADDRESS,
        functionSelector,
        {},
        parameter
      )

      console.log('result length', result.constant_result.length) // 1
      // result only got 1 hex string -> split to 3 parts

      const hexResult = result.constant_result[0]
      let nextNonce = 0
      if (hexResult) {
        // Remove 0x prefix and decode the 3 values
        const hexData = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult

        // Each value is 32 bytes (64 hex chars)
        const amountHex = '0x' + hexData.slice(0, 64) // uint160 (20 bytes, padded to 32)
        const expirationHex = '0x' + hexData.slice(64, 128) // uint48 (6 bytes, padded to 32)
        const nonceHex = '0x' + hexData.slice(128, 192) // uint48 (6 bytes, padded to 32)

        const nonce = parseInt(nonceHex, 16)
        console.log('amount:', parseInt(amountHex, 16))
        console.log('expiration:', parseInt(expirationHex, 16))
        console.log('nonce:', nonce)
        nextNonce = nonce
      }

      return nextNonce
    }

    let token0Permit2Signature: Permit2Signature | null = null
    let token1Permit2Signature: Permit2Signature | null = null

    if (token0.address != NATIVE_HEX) {
      // const nonce0 = await getNextNonce(account.address, token0.address)

      // // // Generate permit2 signatures
      // token0Permit2Signature = await generatePermit2SignatureForScript(
      //   PRIVATE_KEY,
      //   token0,
      //   toEthHex20(POSITION_MANAGER_ADDRESS) as `0x${string}`,
      //   amount0,
      //   nonce0,
      //   deadline,
      //   3448148188
      // )

      await permit2Approve(token0.address, amount0.toString())
    }

    if (token1.address != NATIVE_HEX) {
      // const nonce1 = await getNextNonce(account.address, token1.address)
      // token1Permit2Signature = await generatePermit2SignatureForScript(
      //   PRIVATE_KEY,
      //   token1,
      //   toEthHex20(POSITION_MANAGER_ADDRESS) as `0x${string}`,
      //   amount1,
      //   nonce1,
      //   deadline,
      //   3448148188
      // )
      await permit2Approve(token1.address, amount1.toString())
    }

    console.log('Token0 Permit2 Signature:', token0Permit2Signature)
    console.log('Token1 Permit2 Signature:', token1Permit2Signature)

    const lastEditCurrency = 0
    // Calculate sqrt price for ratio (例如: 32 TRX = 100 USDT)
    const sqrtPriceX96 = encodeSqrtPriceX96WithoutDecimals(token0Amount, token1Amount, token0Decimals, token1Decimals)
    let liquidity = 0n
    if (amount0 === 0n || amount1 === 0n) {
      liquidity = maxLiquidityForAmounts(
        sqrtPriceX96,
        TickMath.getSqrtRatioAtTick(tickLower),
        TickMath.getSqrtRatioAtTick(tickUpper),
        amount0,
        amount1,
        true
      )
    } else {
      const getLiquidity = lastEditCurrency === 0 ? maxLiquidityForAmount0Precise : maxLiquidityForAmount1
      const liquidityFromAmount = lastEditCurrency === 0 ? amount0 : amount1
      liquidity = getLiquidity(
        sqrtPriceX96,
        lastEditCurrency === 0 ? TickMath.getSqrtRatioAtTick(tickUpper) : TickMath.getSqrtRatioAtTick(tickLower),
        liquidityFromAmount
      )
    }

    // Now you can use these signatures in addCLLiquidityMulticall

    const input = {
      // tokenId: 2n,
      isInitialized: true,
      sqrtPriceX96: 0n, // Your sqrt price
      positionConfig: {
        poolKey: {
          currency0: token0.address,
          currency1: token1.address,
          hooks: hooks,
          poolManager: toEthHex20(POOL_MANAGER_ADDRESS) as `0x${string}`,
          fee: fee,
          parameters: {
            tickSpacing: tickSpacing,
          },
          /* your pool key */
        },
        tickLower: tickLower,
        tickUpper: tickUpper,
      },
      liquidity: liquidity, // Your liquidity amount
      owner: account.address,
      recipient: account.address,
      amount0Max: amount0,
      amount1Max: amount1,
      deadline: BigInt(deadline),
      modifyPositionHookData: hooks,
      token0Permit2Signature: token0Permit2Signature ?? undefined,
      token1Permit2Signature: token1Permit2Signature ?? undefined,
    }

    console.log('input', input)

    const multicallData = addCLLiquidityMulticall(input as any)

    console.log('Multicall data:', multicallData)

    /*
         {
            "outputs": [
                {
                    "name": "results",
                    "type": "bytes[]"
                }
            ],
            "inputs": [
                {
                    "name": "data",
                    "type": "bytes[]"
                }
            ],
            "name": "multicall",
            "stateMutability": "payable",
            "type": "function"
        },
    */

    // Broadcast the transaction on-chain
    const functionSelector = 'multicall(bytes[])'

    // Prepare parameters for the transaction
    const parameter = [
      {
        type: 'bytes[]',
        value: multicallData,
      },
    ]

    // Calculate callValue for native TRX payments
    let callValue = 0
    if (toEthHex20(TOKEN0) === NATIVE_HEX) callValue += parseInt(amount0.toString())
    if (toEthHex20(TOKEN1) === NATIVE_HEX) callValue += parseInt(amount1.toString())

    console.log('callValue', callValue)
    // return

    // Build the transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      POSITION_MANAGER_ADDRESS,
      functionSelector,
      {
        feeLimit: 1_000_000_000, // 500 TRX fee limit
        callValue: callValue,
      },
      parameter,
      undefined
    )

    console.log('transaction', transaction)
    // return

    const signedTx = await tronWeb.trx.sign(transaction.transaction)

    const result = await tronWeb.trx.sendRawTransaction(signedTx)

    console.log('Transaction broadcasted!')
    console.log('TxID:', result.txid)
    console.log('Result:', result)
  } catch (error) {
    console.error('Error:', error)
  }
}

const getTransactionInfo = async (txid: string) => {
  const receipt = await tronWeb.trx.getTransactionInfo(txid)
  if (receipt.receipt && receipt.receipt.result !== 'SUCCESS') {
    console.log('❌ Transaction reverted!')
    console.log('Result:', receipt.receipt.result)
    console.log('Energy usage:', receipt.receipt.energy_usage)
    console.log('Contract address:', receipt.contract_address)
  }
}

async function permit2Approve(tokenAddr: string, amount: string) {
  if (!PERMIT2_ADDRESS) return
  const expiration = (Math.floor(Date.now() / 1000) + 3600).toString()
  const ownerHex = tronWeb.address.toHex(tronWeb.defaultAddress.base58 as string)
  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    PERMIT2_ADDRESS,
    'approve(address,address,uint160,uint48)',
    { feeLimit: 100_000_000, callValue: 0 },
    [
      { type: 'address', value: tokenAddr },
      { type: 'address', value: POSITION_MANAGER_ADDRESS },
      { type: 'uint160', value: amount },
      { type: 'uint48', value: expiration },
    ],
    ownerHex
  )
  if (built.result && built.result.result) {
    const signed = await tronWeb.trx.sign(built.transaction)
    const res = await tronWeb.trx.sendRawTransaction(signed)
    console.log('✅ Permit2 approve transaction sent', res)
  }
}

function alignToSpacing(value: number, spacing: number): number {
  const rem = value % spacing
  return value - rem
}

function toEthHex20(addr: string): string {
  const hex = tronWeb.address.toHex(addr)
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return '0x' + body
}

function toRawAmount(human: string, decimals: number): Decimal {
  return new Decimal(human).mul(new Decimal(10).pow(decimals))
}

export const addCLLiquidityMulticall = ({
  isInitialized,
  sqrtPriceX96,
  tokenId,
  positionConfig,
  liquidity,
  owner,
  recipient,
  amount0Max,
  amount1Max,
  deadline,
  modifyPositionHookData,
  token0Permit2Signature,
  token1Permit2Signature,
}: {
  isInitialized: boolean
  sqrtPriceX96: bigint
  tokenId?: bigint
  positionConfig: CLPositionConfig
  liquidity: bigint
  owner: Address
  recipient: Address
  amount0Max: bigint
  amount1Max: bigint
  deadline: bigint
  modifyPositionHookData: Hex
  token0Permit2Signature?: Permit2Signature
  token1Permit2Signature?: Permit2Signature
}) => {
  const calls: Hex[] = []

  if (!isInitialized) {
    calls.push(encodeCLPositionManagerInitializePoolCalldata(positionConfig.poolKey, sqrtPriceX96))
  }
  if (token0Permit2Signature) {
    calls.push(encodePermit2(owner, token0Permit2Signature))
  }

  if (token1Permit2Signature) {
    calls.push(encodePermit2(owner, token1Permit2Signature))
  }

  // mint
  if (typeof tokenId === 'undefined') {
    calls.push(
      encodeCLPositionManagerMintCalldata(
        positionConfig,
        liquidity,
        recipient,
        amount0Max,
        amount1Max,
        deadline,
        modifyPositionHookData
      )
    )
  } else {
    // increase liquidity
    calls.push(
      encodeCLPositionManagerIncreaseLiquidityCalldata(
        tokenId,
        positionConfig,
        liquidity,
        amount0Max,
        amount1Max,
        modifyPositionHookData,
        deadline
      )
    )
  }

  return calls
}

export const encodePermit2 = (owner: Address, permit2Signature: Permit2Signature) => {
  const { signature, details, spender, sigDeadline } = permit2Signature
  const permitSingle = {
    details: {
      token: details.token as `0x${string}`,
      amount: BigInt(details.amount),
      expiration: Number(details.expiration),
      nonce: Number(details.nonce),
    },
    spender: spender as `0x${string}`,
    sigDeadline: BigInt(sigDeadline),
  }

  return encodeFunctionData({
    abi: Permit2ForwardAbi,
    functionName: 'permit',
    args: [owner, permitSingle, signature],
  })
}

if (require.main === module) {
  //   getTransactionInfo('51edb3d55cacdf7d6183195dd755629366f56a439a8ff450fbe74a57fc92de7f').then(() => {
  //     console.log('done')
  //   })
  testAddLiquidity().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
