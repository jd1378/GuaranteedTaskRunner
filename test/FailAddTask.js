const { GuaranteedTask } = require('../src/index');
const LogTask = require('./LogTask');

function FailAddTaskClass(mock) {
  class FailAddTask extends GuaranteedTask {
    async start() {
      throw new Error(this.args);
    }

    async onFailure(error, removeTask) {
      mock(error);
      removeTask();
      // @ts-ignore
      this.taskRunner.add(LogTask, 'anotherran').exec();
    }
  }
  return FailAddTask;
}

module.exports = FailAddTaskClass;
