const { GuaranteedTask } = require('../src/index');
const { wait } = require('./utils');

function WaitTaskClass(mockFunc) {
  class WaitTask extends GuaranteedTask {
    async start() {
      await wait(this.args);
      mockFunc('ran');
    }
  }
  return WaitTask;
}

module.exports = WaitTaskClass;
