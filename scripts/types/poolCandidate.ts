export interface PoolCandidate {
  token0: string
  token1: string
  token0Evm: string
  token1Evm: string
  decimals0: number
  decimals1: number
  fee: bigint
  tickSpacing: number
  hook: string
}
