import { Hex } from 'viem'
import { CommandType } from '../router.types'
import { ABIParametersType, CommandUsed, createCommand } from './createCommand'

export class RoutePlanner {
  commands: Hex

  inputs: Hex[]

  constructor() {
    this.commands = '0x'
    this.inputs = []
  }

  addCommand<TCommandType extends CommandUsed>(
    type: TCommandType,
    parameters: ABIParametersType<TCommandType>,
    allowRevert = false
  ): void {
    const command = createCommand(type, parameters)
    this.inputs.push(command.encodedInput)
    if (allowRevert) {
      if (!REVERTIBLE_COMMANDS.has(command.type)) {
        throw new Error(`command type: ${command.type} cannot be allowed to revert`)
      }
      // eslint-disable-next-line no-bitwise
      command.type |= ALLOW_REVERT_FLAG
    }

    this.commands = this.commands.concat(command.type.toString(16).padStart(2, '0')) as Hex
  }

  public size() {
    return this.inputs.length
  }
}

const ALLOW_REVERT_FLAG = 0x80

const REVERTIBLE_COMMANDS = new Set<CommandType>([CommandType.EXECUTE_SUB_PLAN])
