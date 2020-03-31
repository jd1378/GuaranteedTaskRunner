class GuaranteedTask {
  constructor({ id = null }) {
    this.id = id;
    this.attempt = 0;
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
  onFailure(removeTaskFromDB) {
    return Promise.resolve(false);
  }

  // eslint-disable-next-line no-unused-vars
  onFinish() {
    // Make sure you don't throw up ANY errors here. nothing. cause that would mess up your logic.
  }
}

module.exports = GuaranteedTask;
