// TronWeb PoolManager Initialize Testing Script
// Install dependencies: npm install --save-dev tronweb @types/node ts-node --legacy-peer-deps
import * as dotenv from 'dotenv'
import { tronWeb, hexToBytesMethod2 } from './context'
import {
  POOL_MANAGER_ADDRESS,
  TRX_ADDRESS,
  USDT_ADDRESS,
  ETH_ADDRESS,
  USDC_ADDRESS,
  TUSD_ADDRESS,
  USDJ_ADDRESS,
  SUN_ADDRESS,
} from './address'
// import { poolManagerAbi } from './abi/pool_manager_abi'
import {
  encodeSqrtPriceX96,
  encodeSqrtPriceX96WithoutDecimals,
  sqrtPriceX96ToRealPriceWithoutDecimals,
} from './math/sqrtPriceX96'

// Load environment variables
dotenv.config()

/*
   public static class PoolKey extends StaticStruct {
        public final Address token0;
        public final Address token1;
        public final Address hook;
        public final Address poolManager;
        public final Uint24 fee;
        public final Bytes32 id;

        public PoolKey(Address token0, Address token1, Address hook, Address poolManager, Uint24 fee, Bytes32 id) {
            super(token0, token1, hook, poolManager, fee, id);
            this.token0 = token0;
            this.token1 = token1;
            this.hook = hook;
            this.poolManager = poolManager;
            this.fee = fee;
            this.id = id;
        }
    }

    public static class QuoteExactInputSingleParams extends DynamicStruct {
        public final PoolKey poolKey;
        public final Bool zeroForOne;
        public final Uint128 exactAmount;
        public final DynamicBytes hookData;

        public QuoteExactInputSingleParams(PoolKey poolKey, Bool zeroForOne, Uint128 exactAmount,
                DynamicBytes hookData) {
            super(poolKey, zeroForOne, exactAmount, hookData);
            this.poolKey = poolKey;
            this.zeroForOne = zeroForOne;
            this.exactAmount = exactAmount;
            this.hookData = hookData;
        }
    }

    public static void encodeVerify() {

        List<Type> params = new ArrayList<>();
        params.add(
                new QuoteExactInputSingleParams(
                        new PoolKey(
                                new Address("0x0000000000000000000000000000000000000000"),
                                new Address("0x2a769a33b6ed01a074e4a45bffa0778a27949bec"),
                                new Address("0x0000000000000000000000000000000000000000"),
                                new Address("0x2a769a33b6ed01a074e4a45bffa0778a27949bec"),
                                new Uint24(0),
                                new Bytes32(Numeric.hexStringToByteArray("0x0000000000000000000000000000000000000000000000000000000000000000"))),
                        new Bool(true),
                        new Uint128(new BigInteger("1000000000000000000")),
                        new DynamicBytes(Numeric.hexStringToByteArray("0x0000000000000000000000000000000000000000000000000000000000000000"))));

        try {
            // Function f = DefaultFunctionEncoder.makeFunction(
            //         "quoteExactInputSingle",
            //         Arrays.asList("((address,address,address,address,uint24,bytes32),bool,uint128,bytes)"),
            //         params,
            //         Arrays.asList("uint256", "uint256"));

            // System.out.println("f.getInputParameters(): " + f.getInputParameters());
            // System.out.println("f.getOutputParameters(): " + f.getOutputParameters());
            // System.out.println("f.getName(): " + f.getName());

            Function f = new Function(
                "quoteExactInputSingle",
                params,
                Collections.singletonList(new TypeReference<Uint256>() {})
            );

            String encoded = DefaultFunctionEncoder.encode(f);
            System.out.println("encoded: " + encoded);

        } catch (Exception e) {
            log.error("Error creating function: {}", e.getMessage());
        }
    }
*/

async function testCLQuoter(): Promise<void> {
  try {
    // Method 1: Use triggerSmartContract
    try {
      const functionSelector =
        'quoteExactInputSingle(((address,address,address,address,uint24,bytes32),bool,uint128,bytes))'

      // TronWeb parameter format
      const parameter = [
        {
          type: '((address,address,address,address,uint24,bytes32),bool,uint128,bytes)',
          value: [
            [
              '0x0000000000000000000000000000000000000000',
              '0x2a769a33b6ed01a074e4a45bffa0778a27949bec',
              '0x0000000000000000000000000000000000000000',
              '0x2a769a33b6ed01a074e4a45bffa0778a27949bec',
              10,
              hexToBytesMethod2('0x0000000000000000000000000000000000000000000000000000000000000000'),
            ],
            true,
            1000000,
            hexToBytesMethod2('0x0000000000000000000000000000000000000000000000000000000000000000'),
          ],
        },
      ]

      // encode the parameter
      const { tokenValue, tokenId, callValue, feeLimit } = Object.assign(
        {
          tokenValue: 0,
          tokenId: '',
          callValue: 0,
          feeLimit: 100_000_000,
        },
        {
          feeLimit: 100_000_000,
          callValue: 0,
        }
      )
      const result = tronWeb.transactionBuilder._getTriggerSmartContractArgs(
        'TVGSVJLDAZptJQjWkaR5ujmrQd5QTMmU8K',
        functionSelector,
        {
          feeLimit: 100_000_000,
          callValue: 0,
        },
        parameter,
        tronWeb.address.toHex(tronWeb.defaultAddress.hex as string),
        tokenValue,
        tokenId,
        callValue,
        feeLimit
      )
      console.log('encodedParameter:', result)

      return
    } catch (triggerError: any) {
      console.error('❌ Trigger smart contract failed:', triggerError.message)
    }

    console.log('🎉 Initialize test completed!')
  } catch (error: any) {
    console.error('❌ Initialize test failed:', error)

    // Common error messages and solutions
    if (error.message) {
      console.error('💬 Error Message:', error.message)

      if (error.message.includes('CurrenciesInitializedOutOfOrder')) {
        console.log('💡 Solution: Ensure currency0 < currency1 (addresses must be sorted)')
      } else if (error.message.includes('TickSpacingToo')) {
        console.log('💡 Solution: Use valid tick spacing (1-32767)')
      } else if (error.message.includes('LPFeeTooLarge')) {
        console.log('💡 Solution: Fee must be ≤ 1,000,000 (100%)')
      }
    }
  }
}

// Run the test
if (require.main === module) {
  // First check pool count
  testCLQuoter()
}

// 00000000000000000000000000000000000000000000000000000000000000
// 20000000000000000000000000000000000000000000000000000000000000
// 00000000000000000000000000002a769a33b6ed01a074e4a45bffa0778a27
// 949bec00000000000000000000000000000000000000000000000000000000
// 000000000000000000000000000000002a769a33b6ed01a074e4a45bffa077
// 8a27949bec0000000000000000000000000000000000000000000000000000
// 00000000000a00000000000000000000000000000000000000000000000000
// 00000000000000000000000000000000000000000000000000000000000000
// 00000000000000010000000000000000000000000000000000000000000000
// 0000000000000f424000000000000000000000000000000000000000000000
// 00000000000000000120000000000000000000000000000000000000000000
// 0000000000000000000000

// 00000000000000000000000000000000000000000000000000000000000000
// 20000000000000000000000000000000000000000000000000000000000000
// 00000000000000000000000000002a769a33b6ed01a074e4a45bffa0778a27
// 949bec00000000000000000000000000000000000000000000000000000000
// 000000000000000000000000000000002a769a33b6ed01a074e4a45bffa077
// 8a27949bec0000000000000000000000000000000000000000000000000000
// 00000000000a00000000000000000000000000000000000000000000000000
// 00000000000000000000000000000000000000000000000000000000000000
// 00000000000000010000000000000000000000000000000000000000000000
// 0000000000000f424000000000000000000000000000000000000000000000
// 00000000000000000120000000000000000000000000000000000000000000
// 00000000000000000000200000000000000000000000000000000000000000
// 000000000000000000000000

/*

000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a769a33b6ed01a074e4a45bffa0778a27949bec00000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a769a33b6ed01a074e4a45bffa0778a27949bec000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a769a33b6ed01a074e4a45bffa0778a27949bec00000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a769a33b6ed01a074e4a45bffa0778a27949bec000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000
*/
