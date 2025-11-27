export interface SwapStep {
  intermediateCurrency: `0x${string}`
  fee: number
  hooks: `0x${string}`
  poolManager: `0x${string}`
  hookData: `0x${string}`
  parameters: {
    tickSpacing: number
  }
}
