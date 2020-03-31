/* eslint-disable no-underscore-dangle */

const { EventEmitter } = require('events');

class ConditionRunner extends EventEmitter {
  /**
   *
   * @param {Array} functions
   */
  constructor({
    functions, rate = 10 * 1000, startHandle, stopHandle,
  }) {
    super();
    this.startHandle = startHandle;
    this.stopHandle = stopHandle;
    this.passes = undefined;
    this.functions = functions;
    this.rate = rate;
    this.stopped = false;
  }

  async _checksPass() {
    if (this.functions.length) {
      return (
        await Promise.all(
          this.functions.map((func) => func()),
        )
      ).every((condition) => !!condition);
    }
    return true;
  }

  async _keepRunningChecks() {
    if (this.stopped) return;
    const newResult = await this._checksPass();
    if (this.passes !== newResult) {
      this.passes = newResult;
      if (newResult) {
        await this.startHandle();
      } else {
        await this.stopHandle();
      }
    }
    this._loopTimeout = setTimeout(() => this._keepRunningChecks(), this.rate);
  }

  async start() {
    this.stopped = false;
    await this._keepRunningChecks();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this._loopTimeout);
  }
}

module.exports = ConditionRunner;
