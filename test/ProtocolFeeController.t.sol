// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {ProtocolFeeController} from "../src/ProtocolFeeController.sol";
import {PoolKey} from "../src/types/PoolKey.sol";
import {LPFeeLibrary} from "../src/libraries/LPFeeLibrary.sol";
import {TokenFixture} from "./helpers/TokenFixture.sol";
import {Constants} from "../test/helpers/Constants.sol";
import {IHooks} from "../src/interfaces/IHooks.sol";
import {CLPoolParametersHelper} from "../src/libraries/CLPoolParametersHelper.sol";
import {ProtocolFeeLibrary} from "../src/libraries/ProtocolFeeLibrary.sol";
import {IPoolManager} from "../src/interfaces/IPoolManager.sol";
import {IProtocolFees} from "../src/interfaces/IProtocolFees.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CLPoolManagerRouter} from "./helpers/CLPoolManagerRouter.sol";
import {ICLPoolManager} from "../src/interfaces/ICLPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Currency} from "../src/types/Currency.sol";
import {TickMath} from "../src/libraries/TickMath.sol";
import {BalanceDelta} from "../src/types/BalanceDelta.sol";
import {HooksContract} from "./libraries/Hooks/HooksContract.sol";

contract ProtocolFeeControllerTest is Test, TokenFixture {
    using CLPoolParametersHelper for bytes32;
    using ProtocolFeeLibrary for *;

    /// @notice 100% in hundredths of a bip
    uint256 private constant ONE_HUNDRED_PERCENT_RATIO = 1e6;

    /// @dev the initial setting of the default protocol fee for dynamic fee pool is 0.03% i.e. 3bps
    uint24 private constant DEFAULT_PROTOCOL_FEE_FOR_DYNAMIC_FEE_POOL = 300;


    PoolManager poolManager;
    HooksContract public hooksContract;

    function setUp() public {
        initializeTokens();

        poolManager = new PoolManager();

        hooksContract = new HooksContract(0);
    }

    function testOwnerTransfer() public {
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
        // starts with address(this) as owner
        assertEq(controller.owner(), address(this));

        {
            // must from owner
            vm.prank(makeAddr("someone"));
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("someone")));
            controller.transferOwnership(makeAddr("newOwner"));
        }

        controller.transferOwnership(makeAddr("newOwner"));

        // still address(this) as owner before new owner accept
        assertEq(controller.pendingOwner(), makeAddr("newOwner"));
        assertEq(controller.owner(), address(this));

        {
            // must from pending owner
            vm.prank(makeAddr("someone"));
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("someone")));
            controller.acceptOwnership();
        }

        vm.prank(makeAddr("newOwner"));
        controller.acceptOwnership();
        assertEq(controller.owner(), makeAddr("newOwner"));
    }

    function testSetDefaultProtocolFeeForDynamicFeePool(uint24 newDefaultProtocolFeeForDynamicFeePool) public {
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));

        // it should start with 0.03% as default
        assertEq(controller.defaultProtocolFeeForDynamicFeePool(), DEFAULT_PROTOCOL_FEE_FOR_DYNAMIC_FEE_POOL);

        {
            // must from owner
            vm.prank(makeAddr("someone"));
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("someone")));
            controller.setDefaultProtocolFeeForDynamicFeePool(newDefaultProtocolFeeForDynamicFeePool);
        }

        if (newDefaultProtocolFeeForDynamicFeePool > ProtocolFeeLibrary.MAX_PROTOCOL_FEE) {
            vm.expectRevert(ProtocolFeeController.InvalidDefaultProtocolFeeForDynamicFeePool.selector);
            controller.setDefaultProtocolFeeForDynamicFeePool(newDefaultProtocolFeeForDynamicFeePool);
        } else {
            vm.expectEmit(true, true, true, true);
            emit ProtocolFeeController.DefaultProtocolFeeForDynamicFeePoolUpdated(
                DEFAULT_PROTOCOL_FEE_FOR_DYNAMIC_FEE_POOL, newDefaultProtocolFeeForDynamicFeePool
            );
            controller.setDefaultProtocolFeeForDynamicFeePool(newDefaultProtocolFeeForDynamicFeePool);
            assertEq(controller.defaultProtocolFeeForDynamicFeePool(), newDefaultProtocolFeeForDynamicFeePool);
        }
    }

    function testSetProcotolFeeSplitRatio(uint256 newProtocolFeeSplitRatio) public {
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));

        {
            // must from owner
            vm.prank(makeAddr("someone"));
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("someone")));
            controller.setProtocolFeeSplitRatio(newProtocolFeeSplitRatio);
        }

        if (newProtocolFeeSplitRatio > ONE_HUNDRED_PERCENT_RATIO) {
            vm.expectRevert(ProtocolFeeController.InvalidProtocolFeeSplitRatio.selector);
            controller.setProtocolFeeSplitRatio(newProtocolFeeSplitRatio);
        } else {
            vm.expectEmit(true, true, true, true);
            emit ProtocolFeeController.ProtocolFeeSplitRatioUpdated(
                controller.protocolFeeSplitRatio(), newProtocolFeeSplitRatio
            );
            controller.setProtocolFeeSplitRatio(newProtocolFeeSplitRatio);
            assertEq(controller.protocolFeeSplitRatio(), newProtocolFeeSplitRatio);
        }
    }

    function testGetLPFeeFromTotalFee() public {
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
        // common case1: totalFee=1%, splitRatio=33%
        {
            uint24 totalFee = 10000;
            uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);
            assertEq(lpFee, 6722);
        }

        // common case2: totalFee=0.5%, splitRatio=33%
        {
            uint24 totalFee = 5000;
            uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);
            assertEq(lpFee, 3355);
        }

        // common case3: totalFee=0.1%, splitRatio=33%
        {
            uint24 totalFee = 1000;
            uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);
            assertEq(lpFee, 670);
        }

        controller.setProtocolFeeSplitRatio(500000);

        // common case4: totalFee=1%, splitRatio=50%
        {
            uint24 totalFee = 10000;
            uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);
            // protocol fee is capped at 0.4% so lpFee will be 0.6% in this case
            assertEq(lpFee, 6024);
        }

        // common case5: totalFee=0.5%, splitRatio=50%
        {
            uint24 totalFee = 5000;
            uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);
            assertEq(lpFee, 2506);
        }

        // common case6: totalFee=0.1%, splitRatio=50%
        {
            uint24 totalFee = 1000;
            uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);
            assertEq(lpFee, 500);
        }
    }

    function testGetLPFeeFromTotalFee(uint24 totalFee, uint24 splitRatio) public {
        totalFee = uint24(bound(totalFee, 0, LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE));
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));

        // ignore extreme case where splitRatio is over 90% to avoid precision loss
        splitRatio = uint24(bound(splitRatio, 0, ONE_HUNDRED_PERCENT_RATIO * 9 / 10));
        controller.setProtocolFeeSplitRatio(splitRatio);

        // try to simulate the calculation the process of FE initialization pool

        // step1: calculate lpFee from totalFee
        uint24 lpFee = controller.getLPFeeFromTotalFee(totalFee);

        assertGe(lpFee, 0);
        assertLe(lpFee, totalFee);

        // step2: prepare the poolKey
        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            hooks: IHooks(address(0)),

            fee: lpFee,
            parameters: bytes32(0).setTickSpacing(10)
        });
        uint24 protocolFee = controller.protocolFeeForPool(key);
        uint16 protocolFeeZeroForOne = protocolFee.getZeroForOneFee();

        // verify the totalFee expected to be equal to protocolFee + (1 - protocolFee) * lpFee
        assertApproxEqAbs(
            totalFee,
            protocolFeeZeroForOne.calculateSwapFee(lpFee),
            // keeping the error within 0.05% (can't avoid due to precision loss)
            500,
            "totalFee should be equal to protocolFee + (1 - protocolFee) * lpFee"
        );
    }

    function testProtocolFeeForPool(uint24 lpFee, uint256 protocolFeeRatio) public {
        lpFee = uint24(bound(lpFee, 0, LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE));
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
        protocolFeeRatio = bound(protocolFeeRatio, 0, ONE_HUNDRED_PERCENT_RATIO);
        controller.setProtocolFeeSplitRatio(protocolFeeRatio);

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            hooks: IHooks(address(0)),

            fee: lpFee,
            parameters: bytes32(0).setTickSpacing(10)
        });

        uint24 protcolFee = controller.protocolFeeForPool(key);
        uint16 protocolFeeZeroForOne = protcolFee.getZeroForOneFee();

        // protocol fee should be equal for both directions
        assertEq(protocolFeeZeroForOne, protcolFee.getOneForZeroFee());

        // protocol fee should always be no more than the cap
        assertLe(protocolFeeZeroForOne, ProtocolFeeLibrary.MAX_PROTOCOL_FEE);

        if (protocolFeeZeroForOne == ProtocolFeeLibrary.MAX_PROTOCOL_FEE) {
            // for example, given splitRatio=33% then lpFee=0.81538274% is the threshold that will make the protocol fee 0.4%
            assertGe(lpFee, _calculateLPFeeThreshold(controller));
        } else {
            // protocol fee should be protocolFeeRatio of the total fee
            uint24 totalFee = protocolFeeZeroForOne.calculateSwapFee(lpFee);
            assertApproxEqAbs(
                totalFee * controller.protocolFeeSplitRatio() / ONE_HUNDRED_PERCENT_RATIO,
                protocolFeeZeroForOne,
                // keeping the error within 0.01% (can't avoid due to precision loss)
                100
            );
        }
    }

    function testCLPoolInitWithoutProtolFeeController(uint24 lpFee) public {
        lpFee = uint24(bound(lpFee, 0, LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE));
        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            hooks: IHooks(address(0)),
            fee: lpFee,
            parameters: bytes32(0).setTickSpacing(10)
        });
        poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

        (,, uint24 actualProtocolFee, uint24 actualLpFee) = poolManager.getSlot0(key.toId());

        assertEq(actualLpFee, lpFee);
        assertEq(actualProtocolFee, 0);
    }


    function testCLPoolInitWithProtolFeeControllerFuzz(uint24 lpFee, uint256 newProtocolFeeRatio) public {
        lpFee = uint24(bound(lpFee, 0, LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE));
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
        newProtocolFeeRatio = bound(newProtocolFeeRatio, 0, ONE_HUNDRED_PERCENT_RATIO);

        poolManager.setProtocolFeeController(controller);
        controller.setProtocolFeeSplitRatio(newProtocolFeeRatio);

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            hooks: IHooks(address(0)),

            fee: lpFee,
            parameters: bytes32(0).setTickSpacing(10)
        });
        poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

        (,, uint24 actualProtocolFee, uint24 actualLpFee) = poolManager.getSlot0(key.toId());

        assertEq(actualLpFee, lpFee);

        // under default rule protocol fee must be equal for both directions
        uint16 protocolFeeZeroForOne = actualProtocolFee.getZeroForOneFee();
        uint16 protocolFeeOneForZero = actualProtocolFee.getOneForZeroFee();
        assertEq(protocolFeeOneForZero, protocolFeeZeroForOne);

        // protocol fee should always be no more than the cap
        assertLe(protocolFeeOneForZero, ProtocolFeeLibrary.MAX_PROTOCOL_FEE);

        if (protocolFeeOneForZero == ProtocolFeeLibrary.MAX_PROTOCOL_FEE) {
            // for example, given splitRatio=33% then lpFee=0.81538274% is the threshold that will make the protocol fee 0.4%
            assertGe(lpFee, _calculateLPFeeThreshold(controller));
        } else {
            // protocol fee should be the given ratio of the total fee
            uint24 totalFee = protocolFeeZeroForOne.calculateSwapFee(actualLpFee);
            assertApproxEqAbs(
                totalFee * controller.protocolFeeSplitRatio() / ONE_HUNDRED_PERCENT_RATIO,
                protocolFeeZeroForOne,
                // keeping the error within 0.05% (can't avoid due to precision loss)
                500
            );
        }
    }


    function testCLDynamicPoolInitWithProtolFeeControllerFuzz(uint24 newDefaultProtocolFeeForDynamicFeePool) public {
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
        newDefaultProtocolFeeForDynamicFeePool =
            uint24(bound(newDefaultProtocolFeeForDynamicFeePool, 0, ProtocolFeeLibrary.MAX_PROTOCOL_FEE));

        poolManager.setProtocolFeeController(controller);

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            hooks: hooksContract,

            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            parameters: bytes32(0).setTickSpacing(10)
        });
        poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

        (,, uint24 actualProtocolFee,) = poolManager.getSlot0(key.toId());

        // under default rule protocol fee must be equal for both directions
        uint16 protocolFeeZeroForOne = actualProtocolFee.getZeroForOneFee();
        uint16 protocolFeeOneForZero = actualProtocolFee.getOneForZeroFee();
        assertEq(protocolFeeOneForZero, protocolFeeZeroForOne);
        assertEq(protocolFeeOneForZero, DEFAULT_PROTOCOL_FEE_FOR_DYNAMIC_FEE_POOL);

        controller.setDefaultProtocolFeeForDynamicFeePool(newDefaultProtocolFeeForDynamicFeePool);

        key.parameters = bytes32(0).setTickSpacing(30);
        poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

        (,, actualProtocolFee,) = poolManager.getSlot0(key.toId());
        // under default rule protocol fee must be equal for both directions
        protocolFeeZeroForOne = actualProtocolFee.getZeroForOneFee();
        protocolFeeOneForZero = actualProtocolFee.getOneForZeroFee();
        assertEq(protocolFeeOneForZero, protocolFeeZeroForOne);
        assertEq(protocolFeeOneForZero, newDefaultProtocolFeeForDynamicFeePool);

        // verify the original pool is not affected
        {
            key.parameters = bytes32(0).setTickSpacing(10);

            (,, actualProtocolFee,) = poolManager.getSlot0(key.toId());
            // under default rule protocol fee must be equal for both directions
            protocolFeeZeroForOne = actualProtocolFee.getZeroForOneFee();
            protocolFeeOneForZero = actualProtocolFee.getOneForZeroFee();
            assertEq(protocolFeeOneForZero, protocolFeeZeroForOne);
        }
    }


    function testSetProtocolFeeForCLPool(uint24 newProtocolFee) public {
        ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
        poolManager.setProtocolFeeController(controller);

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            hooks: IHooks(address(0)),

            fee: 3000,
            parameters: bytes32(0).setTickSpacing(10)
        });
        poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

        {
            // must from owner
            vm.prank(makeAddr("someone"));
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("someone")));
            controller.setProtocolFee(key, newProtocolFee);
        }

        if (!newProtocolFee.validate()) {
            vm.expectRevert(abi.encodeWithSelector(IProtocolFees.ProtocolFeeTooLarge.selector, newProtocolFee));
            controller.setProtocolFee(key, newProtocolFee);
        } else {
            controller.setProtocolFee(key, newProtocolFee);

            (,, uint24 actualProtocolFee,) = poolManager.getSlot0(key.toId());
            assertEq(actualProtocolFee, newProtocolFee);
        }
    }

    /// @dev when collectProtocolFee with amt=0, event should emit amount collected
    // function testCollectProtocolFee_CollectAllFee() public {
    //     // init protocol fee controller and bind it to poolManager
    //     ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
    //     poolManager.setProtocolFeeController(controller);

    //     // init pool with protocol fee controller
    //     PoolKey memory key = PoolKey({
    //         currency0: currency0,
    //         currency1: currency1,
    //         hooks: IHooks(address(0)),

    //         fee: 2000,
    //         parameters: bytes32(0).setTickSpacing(10)
    //     });
    //     poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

    //     // add some liquidity
    //     CLPoolManagerRouter router = new CLPoolManagerRouter(poolManager, poolManager);
    //     IERC20(Currency.unwrap(currency0)).approve(address(router), 10000 ether);
    //     IERC20(Currency.unwrap(currency1)).approve(address(router), 10000 ether);
    //     router.modifyPosition(
    //         key,
    //         ICLPoolManager.ModifyLiquidityParams({tickLower: -10, tickUpper: 10, liquidityDelta: 1000000 ether, salt: 0}),
    //         ""
    //     );

    //     // swap to generate protocol fee
    //     // by default splitRatio=33.33% if lpFee is 0.2% then protocol fee should be roughly 0.1%
    //     router.swap(
    //         key,
    //         ICLPoolManager.SwapParams({
    //             zeroForOne: true,
    //             amountSpecified: -100 ether,
    //             sqrtPriceLimitX96: TickMath.MIN_SQRT_RATIO + 1
    //         }),
    //         CLPoolManagerRouter.SwapTestSettings({withdrawTokens: true, settleUsingTransfer: true}),
    //         ""
    //     );

    //     // verify protocol fee accrued > 0
    //     uint256 protocolFeesAccrued = poolManager.protocolFeesAccrued(currency0);
    //     assertGt(protocolFeesAccrued, 0);

    //     // collect all fee
    //     vm.expectEmit();
    //     emit ProtocolFeeController.ProtocolFeeCollected(currency0, protocolFeesAccrued);
    //     controller.collectProtocolFee(makeAddr("recipient"), currency0, 0);
    // }

    // function testCollectProtocolFeeForCLPool() public {
    //     // init protocol fee controller and bind it to poolManager
    //     ProtocolFeeController controller = new ProtocolFeeController(address(poolManager));
    //     poolManager.setProtocolFeeController(controller);

    //     // init pool with protocol fee controller
    //     PoolKey memory key = PoolKey({
    //         currency0: currency0,
    //         currency1: currency1,
    //         hooks: IHooks(address(0)),
    //         fee: 2000,
    //         parameters: bytes32(0).setTickSpacing(10)
    //     });
    //     poolManager.initialize(key, Constants.SQRT_RATIO_1_1);

    //     (,, uint24 actualProtocolFee,) = poolManager.getSlot0(key.toId());

    //     // add some liquidity
    //     CLPoolManagerRouter router = new CLPoolManagerRouter(poolManager, poolManager);
    //     IERC20(Currency.unwrap(currency0)).approve(address(router), 10000 ether);
    //     IERC20(Currency.unwrap(currency1)).approve(address(router), 10000 ether);
    //     router.modifyPosition(
    //         key,
    //         ICLPoolManager.ModifyLiquidityParams({tickLower: -10, tickUpper: 10, liquidityDelta: 1000000 ether, salt: 0}),
    //         ""
    //     );

    //     // swap to generate protocol fee
    //     // by default splitRatio=33.33% if lpFee is 0.2% then protocol fee should be roughly 0.1%
    //     router.swap(
    //         key,
    //         ICLPoolManager.SwapParams({
    //             zeroForOne: true,
    //             amountSpecified: -100 ether,
    //             sqrtPriceLimitX96: TickMath.MIN_SQRT_RATIO + 1
    //         }),
    //         CLPoolManagerRouter.SwapTestSettings({withdrawTokens: true, settleUsingTransfer: true}),
    //         ""
    //     );

    //     assertEq(
    //         poolManager.protocolFeesAccrued(currency0),
    //         100 ether * uint256(actualProtocolFee >> 12) / ONE_HUNDRED_PERCENT_RATIO
    //     );

    //     // lp fee should be roughly 0.1 ether, allow 2% error
    //     assertApproxEqAbs(poolManager.protocolFeesAccrued(currency0), 0.1 ether, 0.1 ether / 50);

    //     // check lp fee is twice the protocol fee
    //     (, BalanceDelta accumulatedLPFee) = router.modifyPosition(
    //         key,
    //         ICLPoolManager.ModifyLiquidityParams({
    //             tickLower: -10,
    //             tickUpper: 10,
    //             liquidityDelta: -1000000 ether,
    //             salt: 0
    //         }),
    //         ""
    //     );

    //     // allow 5% error
    //     assertApproxEqAbs(
    //         poolManager.protocolFeesAccrued(currency0) * 2,
    //         uint256(int256(accumulatedLPFee.amount0())),
    //         poolManager.protocolFeesAccrued(currency0) * 2 / 20
    //     );

    //     // collect protocol fee
    //     {
    //         vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("someone")));
    //         vm.prank(makeAddr("someone"));
    //         controller.collectProtocolFee(makeAddr("recipient"), currency0, 0);
    //     }

    //     // collect half
    //     uint256 protocolFeeAmount = poolManager.protocolFeesAccrued(currency0);
    //     vm.expectEmit();
    //     emit ProtocolFeeController.ProtocolFeeCollected(currency0, protocolFeeAmount / 2);
    //     controller.collectProtocolFee(makeAddr("recipient"), currency0, protocolFeeAmount / 2);

    //     assertEq(poolManager.protocolFeesAccrued(currency0), protocolFeeAmount / 2);
    //     assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(makeAddr("recipient")), protocolFeeAmount / 2);

    //     // collect the rest
    //     controller.collectProtocolFee(makeAddr("recipient"), currency0, 0);
    //     assertEq(poolManager.protocolFeesAccrued(currency0), 0);
    //     assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(makeAddr("recipient")), protocolFeeAmount);
    // }


    function _calculateLPFeeThreshold(ProtocolFeeController controller) internal view returns (uint24) {
        return uint24(
            ((ONE_HUNDRED_PERCENT_RATIO / controller.protocolFeeSplitRatio() - 1) * ProtocolFeeLibrary.MAX_PROTOCOL_FEE)
                / (ONE_HUNDRED_PERCENT_RATIO - ProtocolFeeLibrary.MAX_PROTOCOL_FEE)
        );
    }
}
