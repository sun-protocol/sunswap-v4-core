import { Currency, CurrencyAmount, TradeType } from '@pancakeswap/sdk'
import {
  ADDRESS_THIS,
  getPoolAddress,
  InfinityBinPool,
  InfinityClPool,
  Pool,
  RouteType,
  SmartRouter,
  SmartRouterTrade,
  StablePool,
} from '@pancakeswap/smart-router'

import { ACTIONS, ActionsPlanner, encodePoolKey } from '@pancakeswap/infinity-sdk'
import first from 'lodash/first'
import last from 'lodash/last'
import { Address, zeroAddress } from 'viem'
import { ACTION_CONSTANTS } from '../../constants'
import {
  EncodedMultiSwapInParams,
  EncodedMultiSwapOutParams,
  EncodedSingleSwapInParams,
  EncodedSingleSwapOutParams,
  EncodedSingleSwapParams,
} from '../../infinityTypes'
import { CommandType } from '../../router.types'
import { ABIParametersType } from '../../utils/createCommand'
import { currencyAddressInfinity } from '../../utils/currencyAddressInfinity'
import { getPoolKey } from '../../utils/getPoolKey'
import { encodeFeeBips } from '../../utils/numbers'
import { isFirstCurrency } from '../../utils/poolHelpers.tmp'
import { RoutePlanner } from './utils/RoutePlanner'
import { PancakeSwapOptions, SwapRouteMeta, SwapSection, SwapTradeContext } from '../types'
import { parseSwapTradeContext } from './parseSwapTradeContext'

// Wrapper for pancakeswap router-sdk trade entity to encode swaps for Universal Router
export class TradePlanner extends RoutePlanner {
  private context: SwapTradeContext

  constructor(public trade: Omit<SmartRouterTrade<TradeType>, 'gasEstimate'>, public options: PancakeSwapOptions) {
    super()
    if (options.fee && options.flatFee) {
      throw new Error('Cannot specify both fee and flatFee')
    }
    this.context = parseSwapTradeContext(trade, options)
  }

  encode(): void {
    this.addMergedWrapBeforeTrade()
    for (const route of this.context.routes) {
      for (const section of route.sections) {
        this.addWrapBeforeSwap(route, section)
        this.addSwapCommand(route, section)
      }
      this.addWrapAfterRoute(route)
    }
    this.payFee()
    this.returnChanges()
  }

  private addMergedWrapBeforeTrade() {
    if (this.context.mergedWrapBeforeTrade) {
      const { wrap } = this.context.mergedWrapBeforeTrade
      // const forwardV2 = this.context.routes.length === 1 && this.context.routes[0].sections[0].type === RouteType.V2

      // const recipient = relaxToV2(forwardV2, this.context.routes[0].sections[0].pools[0])
      const recipient = ADDRESS_THIS
      const amount = SmartRouter.maximumAmountIn(this.trade, this.options.slippageTolerance).quotient
      if (wrap) {
        this.addCommand(CommandType.WRAP_ETH, [recipient, amount])
      } else {
        const { trade } = this.context
        // Add perm2 before unwrap weth
        if (this.context.options.payerIsUser) {
          this.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
            trade.inputAmount.currency.wrapped.address,
            ADDRESS_THIS,
            amount,
          ])
        }
        this.addCommand(CommandType.UNWRAP_WETH, [recipient, amount])
      }
    }
  }

  private addSwapCommand(route: SwapRouteMeta, section: SwapSection) {
    const { isFirstSection, isLastSection, payerIsUser, route: sectionRoute, nextSection } = section
    const { tradeType } = this.context.trade
    const lastSection = last(route.sections)!
    const wrapFlag = lastSection.unwrapOutput || lastSection.wrapOutput || nextSection?.wrapInput
    const isRouteCustody = this.context.mustCustody || !isLastSection || wrapFlag

    const nextIsV2 = Boolean(nextSection && nextSection.type === RouteType.V2)

    const nextRouteAddress = relaxToV2(nextIsV2, nextSection ? nextSection.pools[0] : null)
    const nextRecipient = nextSection?.wrapInput || nextSection?.unwrapInput ? ADDRESS_THIS : nextRouteAddress
    const recipient = isRouteCustody ? nextRecipient : this.context.user
    const amountOut = !isLastSection ? 0n : route.minimumAmountOut.quotient
    switch (section.type) {
      case RouteType.V2: {
        const amountIn = isFirstSection ? route.maximumAmountIn.quotient : BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE)
        const path = sectionRoute.path.map((token) => token.wrapped.address)
        if (tradeType === TradeType.EXACT_INPUT) {
          this.addCommand(CommandType.V2_SWAP_EXACT_IN, [recipient, amountIn, amountOut, path, payerIsUser])
          return
        }
        this.addCommand(CommandType.V2_SWAP_EXACT_OUT, [recipient, amountOut, amountIn, path, payerIsUser])
        break
      }
      case RouteType.V3: {
        const amountIn = isFirstSection ? route.maximumAmountIn.quotient : BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE)
        const path = SmartRouter.encodeMixedRouteToPath(
          { ...sectionRoute, input: sectionRoute.input, output: sectionRoute.output },
          tradeType === TradeType.EXACT_OUTPUT
        )
        if (tradeType === TradeType.EXACT_INPUT) {
          const params: ABIParametersType<CommandType.V3_SWAP_EXACT_IN> = [
            recipient,
            amountIn,
            amountOut,
            path,
            payerIsUser,
          ]
          this.addCommand(CommandType.V3_SWAP_EXACT_IN, params)
        } else {
          const params: ABIParametersType<CommandType.V3_SWAP_EXACT_OUT> = [
            recipient,
            amountOut,
            amountIn,
            path,
            payerIsUser,
          ]
          this.addCommand(CommandType.V3_SWAP_EXACT_OUT, params)
        }
        break
      }
      case RouteType.STABLE: {
        const amountIn = isFirstSection ? route.maximumAmountIn.quotient : BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE)
        const flags = sectionRoute.pools.map((p) => BigInt((p as StablePool).balances.length))
        const path = sectionRoute.path.map((token) => token.wrapped.address)

        if (tradeType === TradeType.EXACT_INPUT) {
          const params: ABIParametersType<CommandType.STABLE_SWAP_EXACT_IN> = [
            recipient,
            amountIn,
            amountOut,
            path,
            flags,
            payerIsUser,
          ]
          this.addCommand(CommandType.STABLE_SWAP_EXACT_IN, params)
        } else {
          const params: ABIParametersType<CommandType.STABLE_SWAP_EXACT_OUT> = [
            recipient,
            amountOut,
            amountIn,
            path,
            flags,
            payerIsUser,
          ]
          this.addCommand(CommandType.STABLE_SWAP_EXACT_OUT, params)
        }
        break
      }
      case RouteType.InfinityBIN:
      case RouteType.InfinityCL: {
        // Reuse action planner for consecutive Infinity sections
        if (!this.context.reusedActionPlaner) {
          this.context.reusedActionPlaner = new ActionsPlanner()
        }
        const actionPlaner = this.context.reusedActionPlaner

        const amountIn = isFirstSection ? route.maximumAmountIn.quotient : ACTION_CONSTANTS.OPEN_DELTA

        // for middle hops read the amount from vault ( follow sc testcases )
        this.initializeInfinitySwap(actionPlaner, section, route)
        this.addInfinityCommand(actionPlaner, section, amountIn, amountOut)
        this.finalizeInfinitySwap(actionPlaner, section, recipient, amountIn)

        break
      }
      default:
        throw new Error('Invalid route type')
    }
  }

  private addInfinityCommand(actionPlaner: ActionsPlanner, section: SwapSection, amountIn: bigint, amountOut: bigint) {
    if (section.pools.length === 1) {
      this.addInfinitySingleHop(actionPlaner, section, amountIn, amountOut)
      return
    }
    this.addInfinityMultiHop(actionPlaner, section, amountIn, amountOut)
  }

  private addInfinityMultiHop(actionPlaner: ActionsPlanner, section: SwapSection, amountIn: bigint, amountOut: bigint) {
    const { tradeType } = this.context.trade
    const pool = section.pools[0]
    const isCL = SmartRouter.isInfinityClPool(pool)
    if (tradeType === TradeType.EXACT_INPUT) {
      const params: EncodedMultiSwapInParams = {
        currencyIn: currencyAddressInfinity(section.poolIn),
        path: SmartRouter.encodeInfinityRouteToPath(section.route, false),
        amountIn,
        amountOutMinimum: amountOut,
      }
      actionPlaner.add(isCL ? ACTIONS.CL_SWAP_EXACT_IN : ACTIONS.BIN_SWAP_EXACT_IN, [params])
    } else {
      const params: EncodedMultiSwapOutParams = {
        currencyOut: currencyAddressInfinity(section.poolOut),
        path: SmartRouter.encodeInfinityRouteToPath(section.route, true),
        amountOut,
        amountInMaximum: amountIn,
      }
      actionPlaner.add(isCL ? ACTIONS.CL_SWAP_EXACT_OUT : ACTIONS.BIN_SWAP_EXACT_OUT, [params])
    }
  }

  private addInfinitySingleHop(
    actionPlaner: ActionsPlanner,
    section: SwapSection,
    amountIn: bigint,
    amountOut: bigint
  ) {
    const pool = section.pools[0] as InfinityBinPool | InfinityClPool
    const poolKey = getPoolKey(pool)
    const _encodedPoolKey = encodePoolKey(poolKey)

    const { tradeType } = this.context.trade
    const zeroForOne = isFirstCurrency(section.pools[0], section.poolIn)

    const baseParams: EncodedSingleSwapParams = {
      poolKey: _encodedPoolKey,
      zeroForOne,
      hookData: zeroAddress,
    }

    const isCL = SmartRouter.isInfinityClPool(pool)

    if (tradeType === TradeType.EXACT_INPUT) {
      const params: EncodedSingleSwapInParams = {
        ...baseParams,
        amountIn,
        amountOutMinimum: amountOut,
      }
      actionPlaner.add(isCL ? ACTIONS.CL_SWAP_EXACT_IN_SINGLE : ACTIONS.BIN_SWAP_EXACT_IN_SINGLE, [params])
    } else {
      const params: EncodedSingleSwapOutParams = {
        ...baseParams,
        amountOut,
        amountInMaximum: amountIn,
      }
      actionPlaner.add(isCL ? ACTIONS.CL_SWAP_EXACT_OUT_SINGLE : ACTIONS.BIN_SWAP_EXACT_OUT_SINGLE, [params])
    }
  }

  private addWrapBeforeSwap(route: SwapRouteMeta, section: SwapSection) {
    if (this.context.mergedWrapBeforeTrade && section.isFirstSection) {
      return
    }
    if (!section.wrapInput && !section.unwrapInput) {
      return
    }
    const { nextSection } = section
    const forwardV2 = !section.isFirstSection && Boolean(nextSection && nextSection.type === RouteType.V2)
    const recipient = relaxToV2(forwardV2, nextSection ? nextSection.pools[0] : null)
    if (section.wrapInput) {
      const amount = section.isFirstSection ? route.maximumAmountIn.quotient : BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE)
      this.addCommand(CommandType.WRAP_ETH, [recipient, amount])
    }
    if (section.unwrapInput) {
      const amount = section.isFirstSection ? route.maximumAmountIn.quotient : 0n
      // Payer is user include is the first section
      if (section.payerIsUser) {
        this.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [section.route.input.wrapped.address, ADDRESS_THIS, amount])
      }
      this.addCommand(CommandType.UNWRAP_WETH, [recipient, amount])
    }
  }

  private addWrapAfterRoute(route: SwapRouteMeta) {
    const { sections } = route
    const lastSection = last(sections)!
    const firstSection = first(sections)!
    const { mustCustody, trade } = this.context
    const { tradeType } = trade

    // Detect if return changes
    // If one of the routes needs return changes, then we return changes.
    if (
      this.context.returnChanges === null &&
      tradeType === TradeType.EXACT_OUTPUT &&
      (firstSection.wrapInput || firstSection.unwrapInput)
    ) {
      this.context.returnChanges = { wrap: !firstSection.wrapInput }
    }

    if (!lastSection.wrapOutput && !lastSection.unwrapOutput) {
      return
    }

    const recipient = mustCustody ? ADDRESS_THIS : this.context.user
    const amount = mustCustody ? BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE) : route.minimumAmountOut.quotient
    if (this.context.mustCustody && this.context.routes.length === 1) {
      this.context.takeOverWrapSweep = {
        wrap: lastSection.wrapOutput,
      }
    } else {
      if (lastSection.wrapOutput) {
        this.addWrapOut(recipient, amount, lastSection.poolOut)
        return
      }
      this.addUnwrapOut(recipient, amount)
    }
  }

  private addWrapOut(recipient: Address, amountMinimum: bigint, currency: Currency) {
    // Since wrap doesn't support slippage check and unwrap does.
    // We need add an additional sweep command to handle the slippage check.
    this.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountMinimum])
    this.addSweepCommand(currency.wrapped, recipient, amountMinimum)
  }

  private addUnwrapOut(recipient: Address, amountMinimum: bigint) {
    this.addCommand(CommandType.UNWRAP_WETH, [recipient, amountMinimum])
  }

  private addSweepCommand(currency: Currency, recipient: Address, amountMinimum: bigint) {
    this.addCommand(CommandType.SWEEP, [currencyAddressInfinity(currency), recipient, amountMinimum])
  }

  private payFee() {
    let outAmount = SmartRouter.minimumAmountOut(this.trade, this.context.options.slippageTolerance)
    const { tradeType } = this.context.trade
    if (this.context.takeOverWrapSweep) {
      const route = this.context.routes[0]
      const outputCurrency = route.sections[route.sections.length - 1].poolOut
      outAmount = CurrencyAmount.fromRawAmount(outputCurrency, outAmount.quotient)
    }

    const { fee, flatFee } = this.options
    if (fee) {
      const feeBips = BigInt(encodeFeeBips(fee.fee))
      this.addCommand(CommandType.PAY_PORTION, [currencyAddressInfinity(outAmount.currency), fee.recipient, feeBips])
      // If the trade is exact output, and a fee was taken, we must adjust the amount out to be the amount after the fee
      // Otherwise we continue as expected with the trade's normal expected output
      if (tradeType === TradeType.EXACT_OUTPUT) {
        outAmount = outAmount.subtract(outAmount.multiply(feeBips).divide(10000))
      }
    }

    if (flatFee) {
      const _fee = BigInt(flatFee.amount.toString())
      if (_fee < outAmount.quotient) throw new Error("Flat fee can't be greater than minimum amount out")
      this.addCommand(CommandType.TRANSFER, [currencyAddressInfinity(outAmount.currency), flatFee.recipient, _fee])
      // If the trade is exact output, and a fee was taken, we must adjust the amount out to be the amount after the fee
      // Otherwise we continue as expected with the trade's normal expected output
      if (tradeType === TradeType.EXACT_OUTPUT) {
        outAmount = outAmount.subtract(_fee)
      }
    }
    if (this.context.mustCustody) {
      if (this.context.takeOverWrapSweep) {
        const { wrap } = this.context.takeOverWrapSweep
        if (wrap) {
          this.addWrapOut(this.context.user, outAmount.quotient, outAmount.currency)
        } else {
          this.addUnwrapOut(this.context.user, outAmount.quotient)
        }
      } else {
        this.addCommand(CommandType.SWEEP, [
          currencyAddressInfinity(outAmount.currency),
          this.context.user,
          outAmount.quotient,
        ])
      }
    }
  }

  private returnChanges() {
    const { returnChanges, user } = this.context
    if (returnChanges) {
      const { wrap } = returnChanges
      const cmd = wrap ? CommandType.WRAP_ETH : CommandType.UNWRAP_WETH
      this.addCommand(cmd, [user, 0n])
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private initializeInfinitySwap(actionPlaner: ActionsPlanner, section: SwapSection, route: SwapRouteMeta) {
    const { prevSection, wrapInput, unwrapInput, payerIsUser, isFirstSection } = section
    const inputWrapped = wrapInput || unwrapInput
    const mergePrev = prevSection && prevSection.isInfinity && !inputWrapped
    // when payer is user we settle after swap
    if (mergePrev || payerIsUser) {
      return
    }

    const amountIn = route.maximumAmountIn.quotient
    // Send fund to vault ahead of swap, then swap command can read balance from OPEN_DELTA
    actionPlaner.add(ACTIONS.SETTLE, [
      currencyAddressInfinity(section.poolIn),
      isFirstSection ? amountIn : BigInt(ACTION_CONSTANTS.CONTRACT_BALANCE),
      false,
    ])
  }

  private finalizeInfinitySwap(
    actionPlaner: ActionsPlanner,
    section: SwapSection,
    recipient: Address,
    amountIn: bigint
  ) {
    const { prevSection, nextSection, wrapInput, unwrapInput, payerIsUser } = section
    const inputWrapped = wrapInput || unwrapInput
    const mergePrev = prevSection && prevSection.isInfinity && !inputWrapped
    const mergeNext = Boolean(
      nextSection && nextSection.isInfinity && !nextSection.wrapInput && !nextSection.unwrapInput
    )

    if (!mergePrev) {
      if (payerIsUser) {
        actionPlaner.add(ACTIONS.SETTLE, [currencyAddressInfinity(section.poolIn), amountIn, true])
      }
    }

    if (!mergeNext) {
      // send output to router or user
      actionPlaner.add(ACTIONS.TAKE, [currencyAddressInfinity(section.poolOut), recipient, ACTION_CONSTANTS.OPEN_DELTA])

      // for eaxct output, we need to check and move amount left to next( route or user )
      if (this.trade.tradeType === TradeType.EXACT_OUTPUT) {
        actionPlaner.add(ACTIONS.TAKE, [
          currencyAddressInfinity(section.poolIn),
          recipient,
          ACTION_CONSTANTS.OPEN_DELTA,
        ])
      }
    }

    // We can merge Infinity sections if there is no wrap between them
    if (!mergeNext) {
      this.addCommand(CommandType.INFI_SWAP, [actionPlaner.encodeActions(), actionPlaner.encodePlans()])
      this.context.reusedActionPlaner = null
    }
  }
}

function relaxToV2(forwardV2: boolean, pool: Pool | null) {
  const nextRouteAddress = forwardV2 ? getPoolAddress(pool!) : ADDRESS_THIS
  if (!nextRouteAddress) {
    throw new Error('unknown v2 pool address')
  }
  return nextRouteAddress
}
