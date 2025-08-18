// TronWeb PoolManager modifyLiquidity Testing Script (Mint/Increase dual-mode)
import { TronWeb } from 'tronweb'
import { Decimal } from 'decimal.js'
import * as dotenv from 'dotenv'
import { POOL_MANAGER_ADDRESS, TRX_ADDRESS, SUN_ADDRESS } from './address'

dotenv.config()

interface PoolKey {
  currency0: string
  currency1: string
  hooks: string
  poolManager: string
  fee: number
  parameters: string
}

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

const TOKEN0_DECIMALS = parseInt(process.env.TOKEN0_DECIMALS || '6', 10)
const TOKEN1 = process.env.TOKEN1 || SUN_ADDRESS
const TOKEN1_DECIMALS = parseInt(process.env.TOKEN1_DECIMALS || '18', 10)

// Desired deposit amounts (human units)
const DESIRED_AMOUNT0 = process.env.AMOUNT0 || '15'
const DESIRED_AMOUNT1 = process.env.AMOUNT1 || '15'

// pool params
const hooks = '0x0000000000000000000000000000000000000000'
const fee = parseInt(process.env.POOL_FEE || '500', 10)
const tickSpacing = parseInt(process.env.TICK_SPACING || '10', 10)

function encodeParameters(tickSpacing: number): string {
  const shifted = tickSpacing << 16
  return '0x' + shifted.toString(16).padStart(64, '0')
}

function createPoolKey(
  currency0: string,
  currency1: string,
  hooks: string,
  poolManager: string,
  fee: number,
  tickSpacing: number
): PoolKey {
  if (currency0.toLowerCase() >= currency1.toLowerCase()) {
    ;[currency0, currency1] = [currency1, currency0]
  }
  return {
    currency0,
    currency1,
    hooks,
    poolManager,
    fee,
    parameters: encodeParameters(tickSpacing),
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

// 1:1 reference sqrtPrice (Q96)
const Q96_ONE = 2n ** 96n

function q96ToReal(q96: bigint): Decimal {
  return new Decimal(q96.toString()).div(new Decimal(2).pow(96))
}

function pow1_0001_to_tick_sqrt(tick: number): Decimal {
  return new Decimal(1.0001).pow(new Decimal(tick).div(2))
}

function computeLiquidityFromAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0Raw: Decimal,
  amount1Raw: Decimal
): { liquidity: string; estAmount0Used: string; estAmount1Used: string } {
  const Sp = q96ToReal(sqrtPriceX96)
  const Sl = pow1_0001_to_tick_sqrt(tickLower)
  const Su = pow1_0001_to_tick_sqrt(tickUpper)

  if (Sp.lte(Sl)) {
    const L = amount0Raw.mul(Su.sub(Sl).pow(-1)).mul(Sl.mul(Su)).floor()
    return { liquidity: L.toFixed(0), estAmount0Used: amount0Raw.toFixed(0), estAmount1Used: '0' }
  }
  if (Sp.gte(Su)) {
    const L = amount1Raw.mul(Su.sub(Sl).pow(-1)).floor()
    return { liquidity: L.toFixed(0), estAmount0Used: '0', estAmount1Used: amount1Raw.toFixed(0) }
  }
  const L0 = amount0Raw.mul(Su.sub(Sp).pow(-1)).mul(Sp.mul(Su))
  const L1 = amount1Raw.mul(Sp.sub(Sl).pow(-1))
  const L = Decimal.min(L0, L1).floor()
  const used0 = L.mul(Su.sub(Sp)).div(Sp.mul(Su)).floor()
  const used1 = L.mul(Sp.sub(Sl)).floor()
  return { liquidity: L.toFixed(0), estAmount0Used: used0.toFixed(0), estAmount1Used: used1.toFixed(0) }
}

async function erc20Approve(token: string, spender: string, amount: string) {
  try {
    const ownerHex = tronWeb.address.toHex(tronWeb.defaultAddress.base58 as string)
    const built = await tronWeb.transactionBuilder.triggerSmartContract(
      token,
      'approve(address,uint256)',
      { feeLimit: 100_000_000, callValue: 0 },
      [
        { type: 'address', value: spender },
        { type: 'uint256', value: amount },
      ],
      ownerHex
    )
    if (built.result && built.result.result) {
      const signed = await tronWeb.trx.sign(built.transaction)
      await tronWeb.trx.sendRawTransaction(signed)
    }
  } catch {}
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
    await tronWeb.trx.sendRawTransaction(signed)
  }
}

async function testModifyLiquidity(): Promise<void> {
  if (!POSITION_MANAGER_ADDRESS) {
    console.error('POSITION_MANAGER_ADDRESS is required.')
    process.exit(1)
  }

  let token0 = TOKEN0
  let token0Decimals = TOKEN0_DECIMALS
  let token1 = TOKEN1
  let token1Decimals = TOKEN1_DECIMALS
  let amount0Human = new Decimal(DESIRED_AMOUNT0)
  let amount1Human = new Decimal(DESIRED_AMOUNT1)
  if (token0.toLowerCase() >= token1.toLowerCase()) {
    token0 = TOKEN1
    token1 = TOKEN0
    token0Decimals = TOKEN1_DECIMALS
    token1Decimals = TOKEN0_DECIMALS
    ;[amount0Human, amount1Human] = [amount1Human, amount0Human]
  }

  const poolKey = createPoolKey(token0, token1, hooks, POOL_MANAGER_ADDRESS, fee, tickSpacing)
  const base = 1000
  const tickLower = alignToSpacing(-base * tickSpacing, tickSpacing)
  const tickUpper = alignToSpacing(base * tickSpacing, tickSpacing)

  const desired0Raw = toRawAmount(amount0Human.toFixed(), token0Decimals)
  const desired1Raw = toRawAmount(amount1Human.toFixed(), token1Decimals)
  const { liquidity, estAmount0Used, estAmount1Used } = computeLiquidityFromAmounts(
    Q96_ONE,
    tickLower,
    tickUpper,
    desired0Raw,
    desired1Raw
  )

  // settle amounts = desired amounts (保證 allowance 足夠)
  const amount0Settle = desired0Raw.toFixed(0)
  const amount1Settle = desired1Raw.toFixed(0)

  // ERC20 -> Permit2 approve
  if (PERMIT2_ADDRESS) {
    const t0Hex = toEthHex20(TOKEN0)
    const t1Hex = toEthHex20(TOKEN1)
    if (t0Hex !== NATIVE_HEX) await erc20Approve(TOKEN0, PERMIT2_ADDRESS, amount0Settle)
    if (t1Hex !== NATIVE_HEX) await erc20Approve(TOKEN1, PERMIT2_ADDRESS, amount1Settle)
    if (t0Hex !== NATIVE_HEX) await permit2Approve(TOKEN0, amount0Settle)
    if (t1Hex !== NATIVE_HEX) await permit2Approve(TOKEN1, amount1Settle)
  }

  const AbiCoder = (tronWeb.utils as any).ethersUtils.AbiCoder.defaultAbiCoder()

  // actions: SETTLE0, SETTLE1, (MINT/INCREASE), SWEEP0, SWEEP1
  const actions: number[] = []
  actions.push(0x0b)
  actions.push(0x0b)
  const USE_MINT = TOKEN_ID === ''
  actions.push(USE_MINT ? 0x05 : 0x04) // 0x05 = CL_MINT_POSITION_FROM_DELTAS, 0x04 = CL_INCREASE_LIQUIDITY_FROM_DELTAS
  actions.push(0x14)
  actions.push(0x14)
  const actionsBytes = Buffer.from(actions)

  const paramsBytes: string[] = []

  // SETTLE currency0: address(TOKEN0), amount0Settle, payerIsUser=true
  paramsBytes.push(AbiCoder.encode(['address', 'uint256', 'bool'], [toEthHex20(TOKEN0), amount0Settle, true]))
  // SETTLE currency1
  paramsBytes.push(AbiCoder.encode(['address', 'uint256', 'bool'], [toEthHex20(TOKEN1), amount1Settle, true]))

  if (USE_MINT) {
    // CL_MINT_POSITION_FROM_DELTAS: (PoolKey, int24, int24, uint128 amount0Max, uint128 amount1Max, address owner, bytes hookData)
    const owner = tronWeb.defaultAddress.base58 as string
    // PoolKey tuple ABI: (address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters)
    const poolKeyTuple = [
      toEthHex20(poolKey.currency0),
      toEthHex20(poolKey.currency1),
      poolKey.hooks,
      toEthHex20(poolKey.poolManager),
      poolKey.fee,
      poolKey.parameters,
    ]
    paramsBytes.push(
      AbiCoder.encode(
        [
          'tuple(address,address,address,address,uint24,bytes32)',
          'int24',
          'int24',
          'uint128',
          'uint128',
          'address',
          'bytes',
        ],
        [poolKeyTuple, tickLower, tickUpper, amount0Settle, amount1Settle, toEthHex20(owner), '0x']
      )
    )
  } else {
    // CL_INCREASE_LIQUIDITY_FROM_DELTAS: (uint256 tokenId, uint128 amount0Max, uint128 amount1Max, bytes hookData)
    paramsBytes.push(
      AbiCoder.encode(['uint256', 'uint128', 'uint128', 'bytes'], [TOKEN_ID, amount0Settle, amount1Settle, '0x'])
    )
  }

  // SWEEP currency0: (address currency, address to)
  const to = toEthHex20(tronWeb.defaultAddress.base58 as string)
  paramsBytes.push(AbiCoder.encode(['address', 'address'], [toEthHex20(TOKEN0), to]))
  // SWEEP currency1
  paramsBytes.push(AbiCoder.encode(['address', 'address'], [toEthHex20(TOKEN1), to]))

  const payload: string = AbiCoder.encode(['bytes', 'bytes[]'], ['0x' + actionsBytes.toString('hex'), paramsBytes])
  const deadline = Math.floor(Date.now() / 1000) + 600

  const ownerHex = tronWeb.address.toHex(tronWeb.defaultAddress.base58 as string)
  const parameter = [
    { type: 'bytes', value: payload },
    { type: 'uint256', value: deadline.toString() },
  ]

  // callValue = sum of native SETTLE legs
  let callValue = 0
  if (toEthHex20(TOKEN0) === NATIVE_HEX) callValue += parseInt(amount0Settle || '0', 10)
  if (toEthHex20(TOKEN1) === NATIVE_HEX) callValue += parseInt(amount1Settle || '0', 10)

  const result = await tronWeb.transactionBuilder.triggerSmartContract(
    POSITION_MANAGER_ADDRESS,
    'modifyLiquidities(bytes,uint256)',
    { feeLimit: 250_000_000, callValue },
    parameter,
    ownerHex
  )

  if (!(result.result && result.result.result)) {
    console.error('Failed to build transaction:', result)
    process.exit(1)
  }

  const signed = await tronWeb.trx.sign(result.transaction)
  const broadcast = await tronWeb.trx.sendRawTransaction(signed)
  console.log('txid:', broadcast.txid)

  await new Promise((r) => setTimeout(r, 4000))
  try {
    const txInfo = await tronWeb.trx.getTransactionInfo(broadcast.txid)
    console.log('receipt:', {
      blockNumber: txInfo.blockNumber,
      fee: txInfo.fee,
      energyUsed: txInfo.receipt?.energy_usage_total || 0,
      result: txInfo.receipt?.result || 'SUCCESS',
    })
    if (txInfo.log && txInfo.log.length > 0) {
      console.log('events:')
      for (const log of txInfo.log) {
        console.log({ address: tronWeb.address.fromHex(log.address), topics: log.topics, data: log.data })
      }
    }
  } catch (e: any) {
    console.log('Could not fetch transaction details:', e?.message || e)
  }
}

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

const PERMIT2_ABI = [
  // Uniswap Permit2 IAllowanceTransfer
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function transferFrom(address from, address to, uint160 amount, address token)',
]

// 方便：把 base58 轉 0x20bytes
const toHex = (addr: string) => {
  const hex = tronWeb.address.toHex(addr)
  return '0x' + (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).padStart(40, '0')
}

// 預檢（查餘額與兩段 allowance）
async function preflight() {
  const SUN_B58 = 'TDqjTkZ63yHB19w2n7vPm2qAkLHwn9fKKk'
  const PERMIT2_B58 = 'TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h'
  const PM_B58 = 'TUrtUhPsLRQNYJRPBjyCh7a8zcMmwrrFTi'
  const USER_B58 = 'TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB'

  const SUN = await tronWeb.contract(ERC20_ABI, SUN_B58)
  const P2 = await tronWeb.contract(PERMIT2_ABI, PERMIT2_B58)

  // 查餘額
  const bal = await SUN.balanceOf(USER_B58).call()
  console.log('SUN balance:', bal.toString())

  // 第一段 allowance: ERC20 user -> Permit2
  const erc20Allowance = await SUN.allowance(USER_B58, PERMIT2_B58).call()
  console.log('ERC20.allowance(user->Permit2):', erc20Allowance.toString())

  // 第二段 allowance: Permit2 記錄的 user/token/spender
  const res = await P2.allowance(toHex(USER_B58), toHex(SUN_B58), toHex(PM_B58)).call()
  // TronWeb 對多回傳的 tuple 可能是 {amount: string, expiration: string} 或 array，兩種都列印
  console.log('Permit2.allowance amount/exp:', (res.amount ?? res[0]).toString(), (res.expiration ?? res[1]).toString())
}

if (require.main === module) {
  preflight().catch((e) => {
    console.error(e)
    process.exit(1)
  })

  // testModifyLiquidity().catch((e) => {
  //   console.error(e)
  //   process.exit(1)
  // })
}

export { testModifyLiquidity }
