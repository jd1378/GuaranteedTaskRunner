const { GuaranteedTask } = require('../src/index');

// adds 1 to the arg and returns it

function ChainTaskClass(mock) {
  class ChainTask extends GuaranteedTask {
    async start() {
      mock(this.args);
      if (this.args > 3) throw new Error('fail!');
      return this.args + 1;
    }

    async onFailure(error, removeTaskChain) {
      removeTaskChain();
    }
  }
  return ChainTask;
}

module.exports = ChainTaskClass;
