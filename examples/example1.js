// @ts-nocheck
const { GuaranteedTask, TaskRunner } = require('../src/index');
const { deleteData } = require('../test/utils');

deleteData();

class DoLogTask extends GuaranteedTask {
  async start() {
    this.doLog(this.args);
  }

  doLog(args) {
    // eslint-disable-next-line no-console
    console.log(args);
  }
}

async function runExample() {
  const taskRunner = new TaskRunner({ Tasks: [DoLogTask] });
  await taskRunner.start();
  taskRunner.add(DoLogTask, 'tadan').exec();
  await taskRunner.stop();
  taskRunner.db.close();
}

runExample();
