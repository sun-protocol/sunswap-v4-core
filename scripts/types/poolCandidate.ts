export interface PoolCandidate {
  symbol0: string
  symbol1: string
  token0: string
  token1: string
  token0Evm: string
  token1Evm: string
  decimals0: number
  decimals1: number
  fee: bigint
  tickSpacing: number
  hook: string
  token0Amount: bigint
  token1Amount: bigint
}
