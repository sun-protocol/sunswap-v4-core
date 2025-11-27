import { Decimal } from 'decimal.js'

const Q96 = 1n << 96n
const Q192 = 1n << 192n

/** sqrtPriceX96 = floor(sqrt(token1/token0) * 2^96) */
export function encodeSqrtPriceX96(token0Real: string | number | bigint, token1Real: string | number | bigint): bigint {
  const price = new Decimal(token1Real).div(token0Real)
  const sqrtPrice = price.sqrt().mul(new Decimal(2).pow(96))
  return BigInt(sqrtPrice.floor().toFixed(0)) // BigInt version of Q96 encoded sqrt price
}

export function encodeSqrtPriceX96WithoutDecimals(
  token0Real: string | number | bigint,
  token1Real: string | number | bigint,
  dec0: number,
  dec1: number
): bigint {
  const price = new Decimal(BigInt(token1Real) * 10n ** BigInt(dec1)).div(BigInt(token0Real) * 10n ** BigInt(dec0))
  const sqrtPrice = price.sqrt().mul(new Decimal(2).pow(96))
  return BigInt(sqrtPrice.floor().toFixed(0)) // BigInt version of Q96 encoded sqrt price
}

/** decode back to real price (token1/token0) with full precision */
export function sqrtPriceX96ToRealPrice(sqrtPX96: bigint): string {
  const sqrtDecimal = new Decimal(sqrtPX96.toString())
  const price = sqrtDecimal.pow(2).div(new Decimal(2).pow(192))
  return price.toFixed() // full precision string
}

/** decode back to real price (token1/token0) with full precision */
export function sqrtPriceX96ToRealPriceWithoutDecimals(sqrtPX96: bigint, dec0: number, dec1: number): string {
  const sqrtDecimal = new Decimal(sqrtPX96.toString())
  const price = sqrtDecimal.pow(2).div(new Decimal(2).pow(192))
  let result: Decimal
  let exp = dec0 - dec1
  if (exp >= 0) {
    result = price.mul(10n ** BigInt(exp))
  } else {
    result = price.div(10n ** BigInt(-exp))
  }
  return result.toFixed()
}

// Example usage (commented out to avoid execution on import)
const sqrtPX96 = encodeSqrtPriceX96(1n * 10n ** 18n, 3623n * 10n ** 6n)
const sqrtPX96WithoutDecimals = encodeSqrtPriceX96WithoutDecimals(1n, 3623n, 18, 6)
console.log(sqrtPX96)
console.log(sqrtPX96WithoutDecimals)
console.log(sqrtPriceX96ToRealPrice(sqrtPX96))
console.log(sqrtPriceX96ToRealPriceWithoutDecimals(sqrtPX96, 18, 6))

//from contract-mirror project verify
const sqrtPriceX96FromContract = BigInt('4768605873228743255922197')
console.log(sqrtPriceX96FromContract)
console.log(sqrtPriceX96ToRealPrice(sqrtPriceX96FromContract))
console.log(sqrtPriceX96ToRealPriceWithoutDecimals(sqrtPriceX96FromContract, 18, 6))
