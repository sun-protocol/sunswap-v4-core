import { PermitSingle } from '@pancakeswap/permit2-sdk'
import { Currency } from '@pancakeswap/swap-sdk-core'
import { Address, Prettify } from 'viem'

export interface Permit2Signature extends PermitSingle {
  signature: `0x${string}`
}

export type Tuple<T, N, R extends T[] = []> = R['length'] extends N ? R : Tuple<T, N, [...R, T]>

export type Bytes32 = `0x${string}`

/**
 * Hooks registration for all type pool
 * if the value is true, the hook will be registered
 */
export type HooksRegistration = {
  beforeInitialize?: boolean
  afterInitialize?: boolean
  beforeAddLiquidity?: boolean
  afterAddLiquidity?: boolean
  beforeRemoveLiquidity?: boolean
  afterRemoveLiquidity?: boolean
  beforeSwap?: boolean
  afterSwap?: boolean
  beforeDonate?: boolean
  afterDonate?: boolean
  beforeSwapReturnsDelta?: boolean
  afterSwapReturnsDelta?: boolean
  afterMintReturnsDelta?: boolean
  afterBurnReturnsDelta?: boolean
}

export enum POOL_TYPE {
  CLAMM = 'CL',
  Bin = 'Bin',
}
// export type PoolType = 'CL' | 'Bin'
export type PoolType = `${POOL_TYPE}`

export type CLPoolParameter = {
  /**
   * Hooks registration for the pool
   * @see {@link HooksRegistration}
   */
  hooksRegistration?: HooksRegistration
  tickSpacing: number
}

export type BinPoolParameter = {
  /**
   * Hooks registration for the pool
   * @see {@link HooksRegistration}
   */
  hooksRegistration?: HooksRegistration
  binStep: number
}

/**
 * PoolKey is a unique identifier for a pool
 *
 * decoded version of `PoolKey`
 *
 */
export type PoolKey = {
  /**
   * the lower currency address of the pool, use zero address for native token
   */
  currency0: Address
  /**
   * the higher currency address of the pool
   */
  currency1: Address
  /**
   * the address of the hooks contract, if not set, use zero address
   */
  hooks?: Address
  /**
   * the lp fee of the pool, the max fee for cl pool is 1_000_000(100%) and for bin, it is 100_000(10%).
   * If the pool has dynamic fee then it must be exactly equal to 0x800000
   *
   * @see DYNAMIC_FEE_FLAG
   */
  fee: number
  /**
   * the parameters of the pool
   * include:
   *   1. hooks registration callback
   *   2. pool specific parameters: tickSpacing for CLPool, binStep for BinPool
   *
   * @see BinPoolParameter
   * @see CLPoolParameter
   * @see HooksRegistration
   */
  parameters: CLPoolParameter
}

/**
 * encoded poolKey struct
 *
 * @see PoolKey
 * @see {@link https://github.com/pancakeswap/infinity-core/blob/main/src/types/PoolKey.sol|infinity-core}
 */
export type EncodedPoolKey = {
  currency0: Address
  currency1: Address
  hooks: Address
  fee: number
  parameters: Bytes32
}

export type CLPositionConfig = {
  poolKey: PoolKey
  tickLower: number
  tickUpper: number
}

export type EncodedCLPositionConfig = {
  poolKey: Prettify<Omit<PoolKey, 'parameters'> & { parameters: Bytes32 }>
  tickLower: number
  tickUpper: number
}

export type BinPool = {
  poolType: 'Bin'
  token0: Currency
  token1: Currency
  fee: number
  protocolFee: number
  dynamic: boolean
  activeId: number
  binStep: number
  hooksRegistration?: HooksRegistration | undefined
}

export type CLSlot0 = {
  sqrtPriceX96: bigint
  tick: number
  protocolFee: number
  lpFee: number
}

export type BinSlot0 = {
  activeId: number
  protocolFee: number
  lpFee: number
}

export type Slot0<TPoolType extends PoolType | unknown = unknown> = TPoolType extends 'CL'
  ? CLSlot0
  : TPoolType extends 'Bin'
  ? BinSlot0
  : unknown

export type HookTag = 'CL' | 'Bin' | 'Dynamic' | (string & NonNullable<unknown>)

export enum HOOK_CATEGORY {
  DynamicFees = 'Dynamic Fees',
  LiquidityIncentivisation = 'Liquidity Incentivisation',
  YieldOptimisation = 'Yield Optimisation',
  JIT = 'JIT',
  MEV = 'MEV',
  RWA = 'RWA',
  ALM = 'ALM',
  CrossChain = 'Cross-Chain',
  Leverage = 'Leverage',
  PricingCurve = 'Pricing Curve',
  OrderType = 'Order Type',
  Oracle = 'Oracle',
  Others = 'Others',
  BrevisDiscount = 'Fee Discount (Brevis)',
  PrimusDiscount = 'Fee Discount (Primus)',
}

export interface HookData {
  address: Address

  name?: string
  category?: HOOK_CATEGORY[]
  description?: string
  poolType?: POOL_TYPE
  github?: string
  audit?: string
  learnMoreLink?: string
  creator?: string

  isVerified?: boolean
  isUpgradable?: boolean

  hooksRegistration?: HooksRegistration
  hookType?: HookType

  defaultFee?: number
}

export enum HookType {
  Universal = 'Universal',
  PerPool = 'PerPool',
}

export interface PathKey {
  intermediateCurrency: Address
  fee: number
  hooks: Address
  // poolManager: Address
  hookData: `0x${string}`
  parameters: `0x${string}`
}

// export interface CLSwapExactInputParams {
//   address: Address
//   path: PathKey[]
//   amountIn: bigint
//   amountOutMinimum: bigint
// }

// export interface CLSwapExactInputSingleParams {
//   poolKey: PoolKey
//   zeroForOne: boolean
//   amountIn: bigint
//   amountOutMinimum: bigint
//   hookData: `0x${string}`
// }

// export interface BinSwapExactInputSingleParams {
//   poolKey: PoolKey
//   swapForY: boolean
//   amountIn: bigint
//   amountOutMinimum: bigint
//   hookData: `0x${string}`
// }

export interface EncodedSingleSwapParams {
  poolKey: EncodedPoolKey
  zeroForOne: boolean
  hookData: Bytes32
}

export interface EncodedExactInputParams {
  amountIn: bigint
  amountOutMinimum: bigint
}
export interface EncodedExactOutputParams {
  amountOut: bigint
  amountInMaximum: bigint
}

export interface EncodedSingleSwapInParams extends EncodedSingleSwapParams, EncodedExactInputParams {}
export interface EncodedSingleSwapOutParams extends EncodedSingleSwapParams, EncodedExactOutputParams {}

export type EncodedPathKey = {
  intermediateCurrency: Address
  fee: number
  hooks: Address
  // poolManager: Address
  hookData: `0x${string}`
  parameters: `0x${string}`
}

export interface EncodedMultiSwapInParams extends EncodedExactInputParams {
  currencyIn: Address
  path: EncodedPathKey[]
}
export interface EncodedMultiSwapOutParams extends EncodedExactOutputParams {
  currencyOut: Address
  path: EncodedPathKey[]
}
