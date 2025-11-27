import { TronWeb } from 'tronweb'
import { toEvmHex } from './context'

const tronWeb = new TronWeb(
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  'https://nile.trongrid.io',
  process.env.PRIVATE_KEY
)

const tokenAddress = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' // example USDT
const recipient = 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6'
const owner = 'TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB' // base58 address
const amount = 1e6 // 1e6 token (6 decimals)

async function estimateEnergyTransfer() {
  try {
    const parameter = [
      { type: 'address', value: recipient },
      { type: 'uint256', value: amount },
    ]

    const result = await tronWeb.transactionBuilder.estimateEnergy(
      tokenAddress,
      'transfer(address,uint256)',
      { feeLimit: 100_000_000 },
      parameter,
      owner
    )

    console.log('Energy estimate:', result.energy_required || 'N/A')
    console.log('Transaction result:', result)
  } catch (error) {
    console.error('Error estimating energy:', error)
  }
}

async function estimateEnergySwap() {
  try {
    const routerAddress = 'TB6xBCixqRPUSKiXb45ky1GhChFJ7qrfFj' // Router contract

    // Based on your real swap path: JST -> WTRX -> WIN -> TRX
    const swapParameters = [
      {
        type: 'address[]',
        value: [
          'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', // JST
          'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a', // WTRX
          'TNDSHKGBmgRx9mDYA9CnxPx55nu672yQw2', // WIN
          'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // TRX
        ],
      },
      { type: 'string[]', value: ['v2', 'v3', 'v1'] }, // poolVersions
      { type: 'uint256[]', value: [2, 1, 1] }, // versionLen (steps between pools)
      { type: 'uint24[]', value: [0, 100, 0] }, // poolFees (3 steps: JST->WTRX, WTRX->WIN, WIN->TRX)
      {
        type: '(address,uint256,uint256,uint256)',
        value: [
          toEvmHex(owner), // recipient
          '10000000000000000000', // amountIn (10 JST)
          '7270477', // amountOutMinimum (7.270477 TRX)
          Math.floor(Date.now() / 1000) + 1800, // deadline (30 min from now)
        ],
      },
    ]

    const result = await tronWeb.transactionBuilder.estimateEnergy(
      routerAddress,
      'swapExactInput(address[],string[],uint256[],uint24[],(address,uint256,uint256,uint256))',
      { feeLimit: 150_000_000 }, // Higher fee limit for complex swap
      swapParameters,
      owner
    )

    console.log('Swap Energy estimate:', result.energy_required || 'N/A')
    console.log('Swap Transaction result:', result)
  } catch (error) {
    console.error('Error estimating swap energy:', error)
  }
}

// Run both estimations
estimateEnergyTransfer()
estimateEnergySwap()
