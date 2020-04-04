const { GuaranteedTask } = require('../src/index');


function FailTaskClass(mock) {
  class FailTask extends GuaranteedTask {
    async start() {
      throw new Error(this.args);
    }

    async onFailure(error) {
      mock(error);
      return false;
    }
  }
  return FailTask;
}

module.exports = FailTaskClass;
