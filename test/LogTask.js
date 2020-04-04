const { GuaranteedTask } = require('../src/index');

class LogTask extends GuaranteedTask {
  async start() {
    // eslint-disable-next-line
    console.log(this.args);
  }
}

module.exports = LogTask;
