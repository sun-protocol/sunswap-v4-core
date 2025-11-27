/**
 * Commands
 * @description Command Flags used to decode commands
 * Based on Solidity Commands library
 * @enum {number}
 */
export enum CommandType {
  // Masks to extract certain bits of commands
  FLAG_ALLOW_REVERT = 0x80,
  COMMAND_TYPE_MASK = 0x3f,

  // Command Types. Maximum supported command at this moment is 0x3f.
  // The commands are executed in nested if blocks to minimise gas consumption

  // Command Types where value<=0x07, executed in the first nested-if block
  V3_SWAP_EXACT_IN = 0x00,
  V3_SWAP_EXACT_OUT = 0x01,
  PERMIT2_TRANSFER_FROM = 0x02,
  PERMIT2_PERMIT_BATCH = 0x03,
  SWEEP = 0x04,
  TRANSFER = 0x05,
  PAY_PORTION = 0x06,
  // COMMAND_PLACEHOLDER = 0x07;

  // Command Types where 0x08<=value<=0x0f, executed in the second nested-if block
  V2_SWAP_EXACT_IN = 0x08,
  V2_SWAP_EXACT_OUT = 0x09,
  PERMIT2_PERMIT = 0x0a,
  WRAP_ETH = 0x0b,
  UNWRAP_WETH = 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH = 0x0d,
  BALANCE_CHECK_ERC20 = 0x0e,
  // COMMAND_PLACEHOLDER = 0x0f;

  // Command Types where 0x10<=value<=0x20, executed in the third nested-if block
  INFI_SWAP = 0x10,
  V3_POSITION_MANAGER_PERMIT = 0x11,
  V3_POSITION_MANAGER_CALL = 0x12,
  INFI_CL_INITIALIZE_POOL = 0x13,
  INFI_BIN_INITIALIZE_POOL = 0x14,
  INFI_CL_POSITION_CALL = 0x15,
  INFI_BIN_POSITION_CALL = 0x16,
  // COMMAND_PLACEHOLDER = 0x17 -> 0x20

  // Command Types where 0x21<=value<=0x3f
  EXECUTE_SUB_PLAN = 0x21,
  STABLE_SWAP_EXACT_IN = 0x22,
  STABLE_SWAP_EXACT_OUT = 0x23,
  // COMMAND_PLACEHOLDER = 0x24 -> 0x3f
}
