// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2024 PancakeSwap
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IVault, IVaultToken} from "./interfaces/IVault.sol";
import {SettlementGuard} from "./libraries/SettlementGuard.sol";
import {Currency, CurrencyLibrary} from "./types/Currency.sol";
import {BalanceDelta} from "./types/BalanceDelta.sol";
import {ILockCallback} from "./interfaces/ILockCallback.sol";
import {SafeCast} from "./libraries/SafeCast.sol";
import {VaultReserve} from "./libraries/VaultReserve.sol";
import {VaultToken} from "./VaultToken.sol";
import {ProtocolFees} from "./ProtocolFees.sol";
import {ICLPoolManager} from "./interfaces/ICLPoolManager.sol";
import {PoolId} from "./types/PoolId.sol";
import {CLPool} from "./libraries/CLPool.sol";
import {CLPosition} from "./libraries/CLPosition.sol";
import {PoolKey} from "./types/PoolKey.sol";
import {IPoolManager} from "./interfaces/IPoolManager.sol";
import {Hooks} from "./libraries/Hooks.sol";
import {Tick} from "./libraries/Tick.sol";
import {CLPoolParametersHelper} from "./libraries/CLPoolParametersHelper.sol";
import {ParametersHelper} from "./libraries/math/ParametersHelper.sol";
import {LPFeeLibrary} from "./libraries/LPFeeLibrary.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "./types/BalanceDelta.sol";
import {Extsload} from "./Extsload.sol";
import {SafeCast} from "./libraries/SafeCast.sol";
import {CLPoolGetters} from "./libraries/CLPoolGetters.sol";
import {CLHooks} from "./libraries/CLHooks.sol";
import {BeforeSwapDelta} from "./types/BeforeSwapDelta.sol";
import {Currency} from "./types/Currency.sol";
import {TickMath} from "./libraries/TickMath.sol";
import {CLSlot0} from "./types/CLSlot0.sol";
import {VaultAppDeltaSettlement} from "./libraries/VaultAppDeltaSettlement.sol";

contract PoolManager is IVault, VaultToken, Ownable2Step, Ownable2Step, ICLPoolManager, ProtocolFees, NoDelegateCall, Extsload{
    using Hooks for bytes32;
    using LPFeeLibrary for uint24;
    using CLPoolParametersHelper for bytes32;
    using CLPool for *;
    using CLPosition for mapping(bytes32 => CLPosition.Info);
    using CLPoolGetters for CLPool.State;
    using VaultAppDeltaSettlement for IVault;
    using SafeCast for *;
    using CurrencyLibrary for Currency;


    mapping(PoolId id => CLPool.State poolState) private pools;

    mapping(PoolId id => PoolKey poolKey) public poolIdToPoolKey;

    mapping (uint256 => PoolId) public poolIndex; // to keep track of all poolIds by index

    uint256 public poolCount;   // to keep track of total number of pools

    constructor() Ownable(msg.sender) {}

    /// @notice revert if no locker is set
    modifier isLocked() {
        if (SettlementGuard.getLocker() == address(0)) revert NoLocker();
        _;
    }

    /// @inheritdoc IVault
    function getLocker() external view override returns (address) {
        return SettlementGuard.getLocker();
    }

    /// @inheritdoc IVault
    function getUnsettledDeltasCount() external view override returns (uint256) {
        return SettlementGuard.getUnsettledDeltasCount();
    }

    /// @inheritdoc IVault
    function currencyDelta(address settler, Currency currency) external view override returns (int256) {
        return SettlementGuard.getCurrencyDelta(settler, currency);
    }
    
    /// @dev interaction must start from lock
    /// @inheritdoc IVault
    function lock(bytes calldata data) external override returns (bytes memory result) {
        /// @dev only one locker at a time
        SettlementGuard.setLocker(msg.sender);

        result = ILockCallback(msg.sender).lockAcquired(data);
        /// @notice the caller can do anything in this callback as long as all deltas are offset after this
        if (SettlementGuard.getUnsettledDeltasCount() != 0) revert CurrencyNotSettled();

        /// @dev release the lock
        SettlementGuard.setLocker(address(0));
    }

     /// @notice pool manager specified in the pool key must match current contract
    // modifier poolManagerMatch(address poolManager) {
    //     if (address(this) != poolManager) revert PoolManagerMismatch();
    //     _;
    // }

    /// @inheritdoc ICLPoolManager
    function getSlot0(PoolId id)
        external
        view
        override
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
    {
        CLSlot0 slot0 = pools[id].slot0;
        return (slot0.sqrtPriceX96(), slot0.tick(), slot0.protocolFee(), slot0.lpFee());
    }

    /// @inheritdoc ICLPoolManager
    function getLiquidity(PoolId id) external view override returns (uint128 liquidity) {
        return pools[id].liquidity;
    }

    /// @inheritdoc ICLPoolManager
    function getLiquidity(PoolId id, address _owner, int24 tickLower, int24 tickUpper, bytes32 salt)
        external
        view
        override
        returns (uint128 liquidity)
    {
        return pools[id].positions.get(_owner, tickLower, tickUpper, salt).liquidity;
    }

    /// @inheritdoc ICLPoolManager
    function getPosition(PoolId id, address owner, int24 tickLower, int24 tickUpper, bytes32 salt)
        external
        view
        override
        returns (CLPosition.Info memory position)
    {
        return pools[id].positions.get(owner, tickLower, tickUpper, salt);
    }


    function getPoolTickInfo(PoolId id, int24 tick) external view returns (Tick.Info memory) {
        return pools[id].getPoolTickInfo(tick);
    }

    function getPoolBitmapInfo(PoolId id, int16 word) external view returns (uint256 tickBitmap) {
        return pools[id].getPoolBitmapInfo(word);
    }

    function getFeeGrowthGlobals(PoolId id)
        external
        view
        returns (uint256 feeGrowthGlobal0x128, uint256 feeGrowthGlobal1x128)
    {
        return pools[id].getFeeGrowthGlobals();
    }

    /// @inheritdoc IVault
    function getVaultReserve() external view returns (Currency, uint256) {
        return VaultReserve.getVaultReserve();
    }

    /// @inheritdoc IVault
    function accountAppBalanceDelta(
        Currency currency0,
        Currency currency1,
        BalanceDelta delta,
        address settler,
        BalanceDelta hookDelta,
        address hook
    ) internal override {
        (int128 delta0, int128 delta1) = (delta.amount0(), delta.amount1());
        (int128 hookDelta0, int128 hookDelta1) = (hookDelta.amount0(), hookDelta.amount1());

        /// @dev call _accountDeltaForApp once with both delta/hookDelta to save gas and prevent
        /// reservesOfApp from underflow when it deduct before addition
        _accountDeltaForApp(currency0, delta0 + hookDelta0);
        _accountDeltaForApp(currency1, delta1 + hookDelta1);

        // keep track of the balance on vault level
        SettlementGuard.accountDelta(settler, currency0, delta0);
        SettlementGuard.accountDelta(settler, currency1, delta1);
        SettlementGuard.accountDelta(hook, currency0, hookDelta0);
        SettlementGuard.accountDelta(hook, currency1, hookDelta1);
    }

    /// @inheritdoc IVault
    function accountAppBalanceDelta(Currency currency0, Currency currency1, BalanceDelta delta, address settler)
    internal override {
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();

        // keep track of the balance on app level
        _accountDeltaForApp(currency0, delta0);
        _accountDeltaForApp(currency1, delta1);

        // keep track of the balance on vault level
        SettlementGuard.accountDelta(settler, currency0, delta0);
        SettlementGuard.accountDelta(settler, currency1, delta1);
    }

    /// @inheritdoc IVault
    function accountAppBalanceDelta(Currency currency, int128 delta, address settler)
        external
        override
        isLocked
        
    {
        _accountDeltaForApp(currency, delta);
        SettlementGuard.accountDelta(settler, currency, delta);
    }

    /// @inheritdoc IVault
    function take(Currency currency, address to, uint256 amount) external override isLocked {
        unchecked {
            SettlementGuard.accountDelta(msg.sender, currency, -(amount.toInt128()));
            currency.transfer(to, amount);
        }
    }

    /// @inheritdoc IVault
    function mint(address to, Currency currency, uint256 amount) external override isLocked {
        unchecked {
            SettlementGuard.accountDelta(msg.sender, currency, -(amount.toInt128()));
            _mint(to, currency, amount);
        }
    }

    function sync(Currency currency) public override {
        if (currency.isNative()) {
            VaultReserve.setVaultReserve(CurrencyLibrary.NATIVE, 0);
        } else {
            uint256 balance = currency.balanceOfSelf();
            VaultReserve.setVaultReserve(currency, balance);
        }
    }

    /// @inheritdoc IVault
    function settle() external payable override isLocked returns (uint256) {
        return _settle(msg.sender);
    }

    /// @inheritdoc IVault
    function settleFor(address recipient) external payable override isLocked returns (uint256) {
        return _settle(recipient);
    }

    /// @inheritdoc IVault
    function clear(Currency currency, uint256 amount) external isLocked {
        int256 existingDelta = SettlementGuard.getCurrencyDelta(msg.sender, currency);
        int128 amountDelta = amount.toInt128();
        /// @dev since amount is uint256, existingDelta must be positive otherwise revert
        if (amountDelta != existingDelta) revert MustClearExactPositiveDelta();
        unchecked {
            SettlementGuard.accountDelta(msg.sender, currency, -amountDelta);
        }
    }

    /// @inheritdoc IVault
    function burn(address from, Currency currency, uint256 amount) external override isLocked {
        SettlementGuard.accountDelta(msg.sender, currency, amount.toInt128());
        _burnFrom(from, currency, amount);
    }

    /// @inheritdoc IVault
    function collectFee(Currency currency, uint256 amount, address recipient) external  {
        // prevent transfer between the sync and settle balanceOfs (native settle uses msg.value)
        (Currency syncedCurrency,) = VaultReserve.getVaultReserve();
        if (!currency.isNative() && syncedCurrency == currency) revert FeeCurrencySynced();
        reservesOfApp[msg.sender][currency] -= amount;
        currency.transfer(recipient, amount);
    }



        /// @inheritdoc ICLPoolManager
    function initialize(PoolKey memory key, uint160 sqrtPriceX96)
        external
        override
        noDelegateCall
        returns (int24 tick)
    {
        int24 tickSpacing = key.parameters.getTickSpacing();
        if (tickSpacing > TickMath.MAX_TICK_SPACING) revert TickSpacingTooLarge(tickSpacing);
        if (tickSpacing < TickMath.MIN_TICK_SPACING) revert TickSpacingTooSmall(tickSpacing);
        if (key.currency0 >= key.currency1) {
            revert CurrenciesInitializedOutOfOrder(Currency.unwrap(key.currency0), Currency.unwrap(key.currency1));
        }

        ParametersHelper.checkUnusedBitsAllZero(
            key.parameters, CLPoolParametersHelper.OFFSET_MOST_SIGNIFICANT_UNUSED_BITS
        );
        Hooks.validateHookConfig(key);
        CLHooks.validatePermissionsConflict(key);

        /// @notice init value for dynamic lp fee is 0, but hook can still set it in afterInitialize
        uint24 lpFee = key.fee.getInitialLPFee();
        lpFee.validate(LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE);

        CLHooks.beforeInitialize(key, sqrtPriceX96);

        PoolId id = key.toId();
        uint24 protocolFee = _fetchProtocolFee(key);
        tick = pools[id].initialize(sqrtPriceX96, protocolFee, lpFee);

        poolIdToPoolKey[id] = key;
        poolIndex[poolCount] = id; // store the poolId by index
        poolCount += 1;
        

        /// @notice Make sure the first event is noted, so that later events from afterHook won't get mixed up with this one
        emit Initialize(id, key.currency0, key.currency1, key.hooks, key.fee, key.parameters, sqrtPriceX96, tick, poolCount);

        CLHooks.afterInitialize(key, sqrtPriceX96, tick);
    }

    /// @inheritdoc ICLPoolManager
    function modifyLiquidity(
        PoolKey memory key,
        ICLPoolManager.ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) 
        external 
        override 
        noDelegateCall
        isLocked 
        returns (BalanceDelta delta, BalanceDelta feeDelta) {
        // Do not allow add liquidity when paused()
        if (params.liquidityDelta > 0 && paused()) revert PoolPaused();

        PoolId id = key.toId();
        CLPool.State storage pool = pools[id];
        pool.checkPoolInitialized();

        CLHooks.beforeModifyLiquidity(key, params, hookData);

        (delta, feeDelta) = pool.modifyLiquidity(
            CLPool.ModifyLiquidityParams({
                owner: msg.sender,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidityDelta: params.liquidityDelta.toInt128(),
                tickSpacing: key.parameters.getTickSpacing(),
                salt: params.salt
            })
        );

        /// @notice Make sure the first event is noted, so that later events from afterHook won't get mixed up with this one
        emit ModifyLiquidity(id, msg.sender, params.tickLower, params.tickUpper, params.liquidityDelta, params.salt);

        BalanceDelta hookDelta;
        // notice that both generated delta and feeDelta (from lpFee) will both be counted on the user
        (delta, hookDelta) = CLHooks.afterModifyLiquidity(key, params, delta + feeDelta, feeDelta, hookData);

        accountAppDeltaWithHookDelta(key, delta, hookDelta);
    }

    /// @inheritdoc ICLPoolManager
    function swap(PoolKey memory key, ICLPoolManager.SwapParams memory params, bytes calldata hookData)
        external
        override
        noDelegateCall
        isLocked
        returns (BalanceDelta delta)
    {
        if (params.amountSpecified == 0) revert SwapAmountCannotBeZero();

        PoolId id = key.toId();
        CLPool.State storage pool = pools[id];
        pool.checkPoolInitialized();

        (int256 amountToSwap, BeforeSwapDelta beforeSwapDelta, uint24 lpFeeOverride) =
            CLHooks.beforeSwap(key, params, hookData);
        CLPool.SwapState memory state;
        (delta, state) = pool.swap(
            CLPool.SwapParams({
                tickSpacing: key.parameters.getTickSpacing(),
                zeroForOne: params.zeroForOne,
                amountSpecified: amountToSwap,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                lpFeeOverride: lpFeeOverride
            })
        );

        unchecked {
            if (state.feeAmountToProtocol > 0) {
                protocolFeesAccrued[params.zeroForOne ? key.currency0 : key.currency1] += state.feeAmountToProtocol;
            }
        }

        /// @notice Make sure the first event is noted, so that later events from afterHook won't get mixed up with this one
        emit Swap(
            id,
            msg.sender,
            delta.amount0(),
            delta.amount1(),
            state.sqrtPriceX96,
            state.liquidity,
            state.tick,
            state.swapFee,
            state.protocolFee
        );

        BalanceDelta hookDelta;

        /// @dev delta already includes protocol fee
        (delta, hookDelta) = CLHooks.afterSwap(key, params, delta, hookData, beforeSwapDelta);

        accountAppDeltaWithHookDelta(key, delta, hookDelta);
    }

    /// @inheritdoc ICLPoolManager
    function donate(PoolKey memory key, uint256 amount0, uint256 amount1, bytes calldata hookData)
        external
        override
        noDelegateCall
        isLocked
        returns (BalanceDelta delta)
    {
        PoolId id = key.toId();
        CLPool.State storage pool = pools[id];
        pool.checkPoolInitialized();

        CLHooks.beforeDonate(key, amount0, amount1, hookData);

        int24 tick;
        (delta, tick) = pool.donate(amount0, amount1);
        accountAppBalanceDelta(key.currency0, key.currency1, delta, msg.sender);

        /// @notice Make sure the first event is noted, so that later events from afterHook won't get mixed up with this one
        emit Donate(id, msg.sender, amount0, amount1, tick);

        CLHooks.afterDonate(key, amount0, amount1, hookData);
    }


    /// @inheritdoc IPoolManager
    function updateDynamicLPFee(PoolKey memory key, uint24 newDynamicLPFee) external override {
        if (!key.fee.isDynamicLPFee() || msg.sender != address(key.hooks)) revert UnauthorizedDynamicLPFeeUpdate();
        newDynamicLPFee.validate(LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE);

        PoolId id = key.toId();
        pools[id].setLPFee(newDynamicLPFee);
        emit DynamicLPFeeUpdated(id, newDynamicLPFee);
    }

    function _setProtocolFee(PoolId id, uint24 newProtocolFee) internal override {
        pools[id].setProtocolFee(newProtocolFee);
    }

    /// @notice not accept ether
    // receive() external payable {}
    // fallback() external payable {}

    function _accountDeltaForApp(Currency currency, int128 delta) internal {
        if (delta == 0) return;

        /// @dev optimization: msg.sender will always be app address, verification should be done on caller address
        if (delta >= 0) {
            /// @dev arithmetic underflow make sure trader can't withdraw too much from app
            reservesOfApp[msg.sender][currency] -= uint128(delta);
        } else {
            /// @dev arithmetic overflow make sure trader won't deposit too much into app
            reservesOfApp[msg.sender][currency] += uint128(-delta);
        }
    }

    // if settling native, integrators should still call `sync` first to avoid DoS attack vectors
    function _settle(address recipient) internal returns (uint256 paid) {
        (Currency currency, uint256 reservesBefore) = VaultReserve.getVaultReserve();
        if (!currency.isNative()) {
            if (msg.value > 0) revert SettleNonNativeCurrencyWithValue();
            uint256 reservesNow = currency.balanceOfSelf();
            paid = reservesNow - reservesBefore;

            /// @dev reset the reserve after settled
            VaultReserve.setVaultReserve(CurrencyLibrary.NATIVE, 0);
        } else {
            // NATIVE token does not require sync call before settle
            paid = msg.value;
        }

        SettlementGuard.accountDelta(recipient, currency, paid.toInt128());
    }
}