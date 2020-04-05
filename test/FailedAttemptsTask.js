const { GuaranteedTask } = require('../src/index');


function FailedAttemptsTaskClass(mock) {
  class FailedAttemptsTask extends GuaranteedTask {
    async start() {
      throw new Error(this.args);
    }

    async onFailure() {
      mock(this.attempt);
    }
  }
  return FailedAttemptsTask;
}

module.exports = FailedAttemptsTaskClass;
