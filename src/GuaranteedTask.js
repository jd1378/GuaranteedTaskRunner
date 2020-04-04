class GuaranteedTask {
  /**
   * @param {Object} options
   * @param {Number} options.id
   * @param {Object} options.args
   * @param {Numebr} options.nextTaskId
   * @param {Numebr} [options.attempt] = 0
   * @param {*} options.dependency
   * @param {import('./TaskRunner')} options.taskRunner
   */
  constructor(options = {}) {
    this.id = options.id;
    this.args = options.args;
    this.name = this.constructor.name;
    this.nextTaskId = options.nextTaskId;
    this.dependency = options.dependency;
    this.taskRunner = options.taskRunner;
    this.attempt = options.attempt || 0;
  }

  increaseAttempt() {
    this.attempt++;
  }

  start() {
    return Promise.resolve();
  }

  restart() {
    return this.start();
  }

  /**
   * Should always return true if removes the task, false otherwise
   * @param {function} removeTaskFromDB - a function that accepts a Task instance as parameter
   */
  // eslint-disable-next-line no-unused-vars
  onFailure(error, removeTaskFromDB) {
    return Promise.resolve();
  }

  // eslint-disable-next-line no-unused-vars
  onFinish(result) {
    // Make sure you don't throw up ANY errors here. nothing. cause that would mess up your logic.
    return Promise.resolve();
  }
}

module.exports = GuaranteedTask;
