const { GuaranteedTask } = require('../src/index');


function NormalTaskClass(mock) {
  class NormalTask extends GuaranteedTask {
    async start() {
      mock(this.args);
    }
  }
  return NormalTask;
}

module.exports = NormalTaskClass;
