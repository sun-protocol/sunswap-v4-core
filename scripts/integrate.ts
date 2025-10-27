import { POOL_CANDIDATES } from './context'
import { initialize } from './initialize'
import { addLiquidity } from './addLiquidity'
import { burnPosition } from './burnPosition'
import { decreaseLiquidity } from './decreaseLiquidity'
import { mintPosition } from './mintPosition'

const integrate = async () => {
  // all pool candidates
  for (const poolCandidate of POOL_CANDIDATES) {
    // await initialize(poolCandidate, poolCandidate.token0Amount, poolCandidate.token1Amount)
    try {
      await mintPosition(poolCandidate, 100, 100, true)
    } catch (error) {
      console.error(`${poolCandidate.symbol0} / ${poolCandidate.symbol1} integrated failed: ${error}`)
      throw error
    }

    console.log(`${poolCandidate.symbol0} / ${poolCandidate.symbol1} integrated completed`)
  }
}

if (require.main === module) {
  integrate()
    .then(() => {
      console.log('Integrate completed')
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
