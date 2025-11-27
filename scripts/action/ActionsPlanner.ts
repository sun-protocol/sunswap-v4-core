import invariant from 'tiny-invariant'
import {
  Address,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  Hex,
  isAddressEqual,
  maxUint256,
  parseAbiParameters,
  size,
  sliceHex,
  toHex,
  zeroAddress,
} from 'viem'
import { ACTION_CONSTANTS, ACTIONS } from './actions'
import { ACTIONS_ABI, InfinityABIParametersToValuesType, InfinityUsedAction } from './actionsAbiParameters'
import { PoolKey } from './types'

type Plan<TAction extends InfinityUsedAction = InfinityUsedAction> = {
  action: TAction
  param: InfinityABIParametersToValuesType<TAction>
}

export class ActionsPlanner {
  private plans: Plan[] = []

  public add<TAction extends InfinityUsedAction>(action: TAction, param: InfinityABIParametersToValuesType<TAction>) {
    this.plans.push({ action, param } as Plan<InfinityUsedAction>)
  }

  public encodeActions() {
    const actions = concat(
      this.plans.map((plan) =>
        toHex(plan.action, {
          size: 1,
        })
      )
    )
    return actions
  }

  public encodePlans() {
    return this.plans.map((plan) => encodeAbiParameters(ACTIONS_ABI[plan.action], plan.param))
  }

  public encode(): Hex {
    const encodeAbi = parseAbiParameters('bytes, bytes[]')
    const actions = concat(
      this.plans.map((plan) =>
        toHex(plan.action, {
          size: 1,
        })
      )
    )
    return encodeAbiParameters(encodeAbi, [
      actions,
      this.plans.map((plan) => encodeAbiParameters(ACTIONS_ABI[plan.action], plan.param)),
    ])
  }

  static decode(calls: Hex) {
    const decodeAbi = parseAbiParameters('bytes, bytes[]')
    const [actions_, params] = decodeAbiParameters(decodeAbi, calls)
    const actionsSize = size(actions_)
    const actions: InfinityUsedAction[] = []
    for (let i = 0; i < actionsSize; i++) {
      const action = Number(sliceHex(actions_, i, i + 1)) as InfinityUsedAction
      actions.push(action)
    }
    const plans = []
    for (let i = 0; i < actionsSize; i++) {
      plans.push({
        action: actions[i],
        actionName: ACTIONS[actions[i]],
        param: decodeAbiParameters(ACTIONS_ABI[actions[i]], params[i]),
      })
    }

    return plans
  }

  public finalizeModifyLiquidityWithTake(poolKey: PoolKey, takeRecipient: Address) {
    this.add(ACTIONS.TAKE, [poolKey.currency0, takeRecipient, ACTION_CONSTANTS.OPEN_DELTA])
    this.add(ACTIONS.TAKE, [poolKey.currency1, takeRecipient, ACTION_CONSTANTS.OPEN_DELTA])

    return this.encode()
  }

  public finalizeModifyLiquidityWithClose(poolKey: PoolKey) {
    this.add(ACTIONS.CLOSE_CURRENCY, [poolKey.currency0])
    this.add(ACTIONS.CLOSE_CURRENCY, [poolKey.currency1])

    return this.encode()
  }

  public finalizeModifyLiquidityWithCloseWrap(poolKey: PoolKey, wrapAddress: Address, recipient: Address) {
    const wrapAmount = BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE)
    this.add(ACTIONS.TAKE, [zeroAddress, ACTION_CONSTANTS.ADDRESS_THIS, ACTION_CONSTANTS.OPEN_DELTA])
    this.add(ACTIONS.CLOSE_CURRENCY, [poolKey.currency1])
    this.add(ACTIONS.WRAP, [wrapAmount])
    this.add(ACTIONS.SWEEP, [wrapAddress, recipient])

    return this.encode()
  }

  public finalizeModifyLiquidityWithCloseNative(poolKey: PoolKey, sweepRecipient: Address) {
    invariant(poolKey.currency0 === zeroAddress, 'currency0 must be native currency')
    this.add(ACTIONS.CLOSE_CURRENCY, [poolKey.currency0])
    this.add(ACTIONS.CLOSE_CURRENCY, [poolKey.currency1])
    this.add(ACTIONS.SWEEP, [poolKey.currency0, sweepRecipient])

    return this.encode()
  }

  /**
   * Pay and settle currency pair. User's token0 and token1 will be transferred from user and paid.
   * This is commonly used for increase liquidity or mint action.
   */
  public finalizeModifyLiquidityWithSettlePair(poolKey: PoolKey, sweepRecipient: Address) {
    this.add(ACTIONS.SETTLE_PAIR, [poolKey.currency0, poolKey.currency1])
    if (poolKey.currency0 === zeroAddress) {
      this.add(ACTIONS.SWEEP, [poolKey.currency0, sweepRecipient])
    }

    return this.encode()
  }

  /**
   * Take all amount owed from currency pair. Owed token0 and token1 will be transferred to `takeRecipient`.
   * This is commonly used for decrease liquidity or burn action.
   */
  public finalizeModifyLiquidityWithTakePair(poolKey: PoolKey, takeRecipient: Address) {
    this.add(ACTIONS.TAKE_PAIR, [poolKey.currency0, poolKey.currency1, takeRecipient])

    return this.encode()
  }

  public finalizeSwap(inputCurrency: Address, outputCurrency: Address, takeRecipient: Address) {
    if (isAddressEqual(takeRecipient, ACTION_CONSTANTS.MSG_SENDER)) {
      this.add(ACTIONS.SETTLE_ALL, [inputCurrency, maxUint256])
      this.add(ACTIONS.TAKE_ALL, [outputCurrency, 0n])
    } else {
      this.add(ACTIONS.SETTLE, [inputCurrency, ACTION_CONSTANTS.OPEN_DELTA, true])
      this.add(ACTIONS.TAKE, [outputCurrency, takeRecipient, ACTION_CONSTANTS.OPEN_DELTA])
    }

    return this.encode()
  }
}
