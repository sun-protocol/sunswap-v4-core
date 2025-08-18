import { TronWeb } from 'tronweb'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize TronWeb instance
const tronWeb = new TronWeb(
  'https://nile.trongrid.io', // fullNode
  'https://nile.trongrid.io', // solidityNode
  'https://nile.trongrid.io', // eventServer
  process.env.PRIVATE_KEY
)

tronWeb.setHeader({
  headers: {
    'TRON-PRO-API-KEY': process.env.TRON_PRO_API_KEY,
  },
})

// to make sure tronWeb is initialized
const toEvmHex = (addr: string) => '0x' + tronWeb.address.toHex(addr).slice(2) // 去掉 41 prefix

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

export { tronWeb, toEvmHex, hexToBytesMethod1, hexToBytesMethod2, hexToBytesMethod3 }
