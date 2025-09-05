import { TronWeb } from 'tronweb'
import * as dotenv from 'dotenv'
import { privateKeyToAccount } from 'viem/accounts'
import Decimal from 'decimal.js'

// Load environment variables
dotenv.config()

// Initialize TronWeb instance
const tronWeb = new TronWeb(
  'https://nile.trongrid.io', // fullNode
  'https://nile.trongrid.io', // solidityNode
  'https://nile.trongrid.io', // eventServer
  process.env.PRIVATE_KEY
)

if (process.env.TRON_PRO_API_KEY) {
  tronWeb.setHeader({
    headers: {
      'TRON-PRO-API-KEY': process.env.TRON_PRO_API_KEY,
    },
  })
}

const getEvmAccount = () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is not set')
  }
  const PRIVATE_KEY = ('0x' + process.env.PRIVATE_KEY) as `0x${string}`
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`)
  return account
}

const ZERO_HEX_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEFAULT_FEE = 500n
const DEFAULT_TICK_SPACING = 10
const DEFAULT_DEADLINE = Math.floor(Date.now() / 1000) + 3600 // 1 hour

// to make sure tronWeb is initialized
function toEvmHex(addr: string): string {
  const hex = tronWeb.address.toHex(addr)
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return '0x' + body
}

function selectorToHex(selector: string): string {
  return tronWeb.utils.ethersUtils.keccak256(tronWeb.utils.ethersUtils.toUtf8Bytes(selector)).slice(0, 10)
}

// 方法1: 使用 TronWeb 內建方法
function hexToBytesMethod1(hexString: string): number[] {
  // 移除 0x 前綴
  const cleanHex = hexString.replace(/^0x/, '')
  return tronWeb.utils.code.hexStr2byteArray(cleanHex)
}

// 方法2: 使用 Buffer (Node.js)
function hexToBytesMethod2(hexString: string): Uint8Array {
  const cleanHex = hexString.replace(/^0x/, '')
  return Buffer.from(cleanHex, 'hex')
}

// 方法3: 手動轉換
function hexToBytesMethod3(hexString: string): number[] {
  const cleanHex = hexString.replace(/^0x/, '')
  const bytes: number[] = []

  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16))
  }

  return bytes
}

// Helper function to encode parameters with tick spacing
function encodeParameters(tickSpacing: number): string {
  // Based on CLPoolParametersHelper: tickSpacing is stored at bits 16-39
  // tickSpacing 1 = 0x10000, tickSpacing 10 = 0xa0000, etc.
  const shifted = tickSpacing << 16
  return '0x' + shifted.toString(16).padStart(64, '0')
}

/**
 * Parse TronWeb constant_result based on ABI output definition
 * @param hexResult - The hex string from constant_result[0]
 * @param outputs - Array of ABI output definitions with optional components for tuples
 * @returns Parsed object with named properties
 */
function parseConstantResult(
  hexResult: string,
  outputs: Array<{
    name: string
    type: string
    components?: Array<{ name: string; type: string }>
  }>
): Record<string, any> {
  // Remove 0x prefix if present
  const cleanHex = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult

  const result: Record<string, any> = {}
  let offset = 0

  for (const output of outputs) {
    if (output.type === 'tuple' && output.components) {
      // Handle tuple (struct) types
      const tupleResult: Record<string, any> = {}

      for (const component of output.components) {
        const hexValue = cleanHex.slice(offset, offset + 64)

        if (component.type === 'address') {
          // Address takes 20 bytes, but padded to 32 bytes (last 40 hex chars)
          const addressHex = hexValue.slice(24) // Skip 24 hex chars (12 bytes) of padding
          tupleResult[component.name] = '0x' + addressHex
        } else if (component.type.startsWith('int')) {
          // Handle signed integers (int24, int256, etc.)
          const bitLength = parseInt(component.type.replace('int', '')) || 256

          // For types smaller than 256 bits, extract only the relevant bits from the right
          let relevantHex: string
          if (bitLength < 256) {
            const hexChars = Math.ceil(bitLength / 4) // 4 bits per hex char
            relevantHex = hexValue.slice(-hexChars) // Take from the right
          } else {
            relevantHex = hexValue
          }

          let value = BigInt('0x' + relevantHex)
          const signBit = BigInt(2) ** BigInt(bitLength - 1)

          // Check if it's negative (two's complement)
          if (value >= signBit) {
            value = value - BigInt(2) ** BigInt(bitLength)
          }

          tupleResult[component.name] = value
        } else if (component.type.startsWith('uint')) {
          // Handle all unsigned integers (uint24, uint160, uint256, etc.)
          tupleResult[component.name] = BigInt('0x' + hexValue)
        } else if (component.type === 'bytes32') {
          tupleResult[component.name] = '0x' + hexValue
        } else {
          throw new Error(`Unsupported component type: ${component.type}`)
        }

        offset += 64
      }

      result[output.name] = tupleResult
    } else {
      // Handle simple types
      const hexValue = cleanHex.slice(offset, offset + 64)

      if (output.type === 'address') {
        // Address takes 20 bytes, but padded to 32 bytes (last 40 hex chars)
        const addressHex = hexValue.slice(24) // Skip 24 hex chars (12 bytes) of padding
        result[output.name] = '0x' + addressHex
      } else if (output.type.startsWith('int')) {
        // Handle signed integers (int24, int256, etc.)
        const bitLength = parseInt(output.type.replace('int', '')) || 256

        // For types smaller than 256 bits, extract only the relevant bits from the right
        let relevantHex: string
        if (bitLength < 256) {
          const hexChars = Math.ceil(bitLength / 4) // 4 bits per hex char
          relevantHex = hexValue.slice(-hexChars) // Take from the right
        } else {
          relevantHex = hexValue
        }

        let value = BigInt('0x' + relevantHex)
        const signBit = BigInt(2) ** BigInt(bitLength - 1)

        // Check if it's negative (two's complement)
        if (value >= signBit) {
          value = value - BigInt(2) ** BigInt(bitLength)
        }

        result[output.name] = value
      } else if (output.type.startsWith('uint')) {
        // Handle all unsigned integers (uint24, uint160, uint256, etc.)
        result[output.name] = BigInt('0x' + hexValue)
      } else if (output.type === 'bytes32') {
        result[output.name] = '0x' + hexValue
      } else {
        throw new Error(`Unsupported type: ${output.type}`)
      }

      offset += 64
    }
  }

  return result
}

function alignToSpacing(value: number, spacing: number): number {
  const rem = value % spacing
  return value - rem
}

function toRawAmount(human: string, decimals: number): string {
  return new Decimal(human).mul(new Decimal(10).pow(decimals)).toFixed(0)
}

// 測試函數
function testHexToBytes() {
  const testHex = '0x0000000000000000000000000000000000000000000000000000000000000000'

  console.log('原始 hex:', testHex)
  console.log('方法1 (TronWeb):', hexToBytesMethod1(testHex))
  console.log('方法2 (Buffer):', Array.from(hexToBytesMethod2(testHex)))
  console.log('方法3 (手動):', hexToBytesMethod3(testHex))

  // 測試非零值
  const testHex2 = '0x1234567890abcdef'
  console.log('\n測試 hex:', testHex2)
  console.log('轉換結果:', hexToBytesMethod1(testHex2))
}

// 在合約調用中使用
function exampleContractCall() {
  const hexParam = '0x0000000000000000000000000000000000000000000000000000000000000000'
  const bytesParam = hexToBytesMethod1(hexParam)

  console.log('合約參數 (bytes):', bytesParam)

  // 在 triggerSmartContract 中使用
  const parameter = [{ type: 'bytes', value: bytesParam }]

  return parameter
}

// 運行測試
if (require.main === module) {
  testHexToBytes()
  console.log('\n合約調用示例:')
  console.log(exampleContractCall())
}

export {
  tronWeb,
  getEvmAccount,
  toEvmHex,
  hexToBytesMethod1,
  hexToBytesMethod2,
  hexToBytesMethod3,
  selectorToHex,
  encodeParameters,
  parseConstantResult,
  alignToSpacing,
  toRawAmount,
  ZERO_HEX_ADDRESS,
  DEFAULT_FEE,
  DEFAULT_TICK_SPACING,
  DEFAULT_DEADLINE,
}
