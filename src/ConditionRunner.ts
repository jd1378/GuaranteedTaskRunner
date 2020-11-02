/* eslint-disable no-underscore-dangle */

import { EventEmitter } from 'events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PossibleFunctions = (() => void) | (() => Promise<any>);

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ConditionRunnerOptions = {
  /** Functions that are run periodically and must
   * return true or resolve true for runner to continue working */
  runConditions?: Array<PossibleFunctions>;
  /** Time in milliseconds. Default 10 sec. */
  rate?: number;
  /** The function to call when runConditions all become true  */
  startHandle: PossibleFunctions;
  /** The function to call when runConditions all become false  */
  stopHandle: PossibleFunctions;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export default class ConditionRunner extends EventEmitter {
  stopped: boolean;

  rate: number;

  runConditions: Array<PossibleFunctions>;

  passes = false;

  startHandle: PossibleFunctions;

  stopHandle: PossibleFunctions;

  private loopTimeout: NodeJS.Timeout | undefined;

  constructor(options: ConditionRunnerOptions) {
    super();
    this.startHandle = options.startHandle;
    this.stopHandle = options.stopHandle;
    this.runConditions = options.runConditions || [];
    this.rate = options.rate || 10 * 1000;
    this.stopped = false;
  }

  private async isPassingChecks() {
    if (this.runConditions.length) {
      return (
        await Promise.all(this.runConditions.map((func) => func()))
      ).every((condition) => !!condition);
    }
    return true;
  }

  private async keepRunningChecks() {
    if (this.stopped) return;
    const newResult = await this.isPassingChecks();
    if (this.passes !== newResult) {
      this.passes = newResult;
      if (newResult) {
        await this.startHandle();
      } else {
        await this.stopHandle();
      }
    }
    this.loopTimeout = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.keepRunningChecks();
    }, this.rate);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.keepRunningChecks();
  }

  stop(): void {
    this.stopped = true;
    this.passes = false;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
    }
  }
}
