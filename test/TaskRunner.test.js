// @ts-nocheck
/* eslint-disable max-classes-per-file */
const { deleteData } = require('./utils');
const { GuaranteedTask, TaskRunner } = require('../src/index');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mock = jest.fn();

class LongRunningTask extends GuaranteedTask {
  async start() {
    await wait(this.args);
    mock('ran');
  }
}

describe('TaskRunner', () => {
  beforeEach(() => {
    deleteData();
  });

  describe('general', () => {
    let taskRunner;
    beforeEach(() => {
      taskRunner = new TaskRunner(
        { Task: LongRunningTask },
      );
    });
    afterEach(async () => {
      await taskRunner.stop();
      await taskRunner.closeDb();
    });

    it('waits for running tasks to finish after calling stop', async () => {
      await taskRunner.start();
      taskRunner.addTask(300);
      await taskRunner.stop();
      expect(taskRunner.running).toBeFalsy();
      expect(mock).toBeCalledTimes(1);
    });

    it('It removes finished tasks properly after finished', async () => {
      await taskRunner.start();
      await taskRunner.addTask(300);
      expect(taskRunner.getAllTasksFromDb().length).toBe(0);
      expect(Array.from(taskRunner.runningTasks.entries()).length).toBe(0);
    });

    it('runs multiple tasks fine', async () => {
      await taskRunner.start();
      taskRunner.addTask(1);
      taskRunner.addTask(10);
      taskRunner.addTask(100);
      await taskRunner.stop();
      expect(mock).toBeCalledTimes(3);
      expect(taskRunner.getAllTasksFromDb().length).toBe(0);
    });

    it('should shut down gracefully', async () => {
      await taskRunner.start();
      taskRunner.addTask(1000);
      process.emit('SIGTERM', 'SIGTERM');
      const waitForStop = () => new Promise((resolve) => {
        const isStopped = () => !taskRunner.running && !taskRunner.stopping;
        const doCheck = () => {
          setTimeout(() => {
            if (isStopped()) {
              resolve();
            } else {
              doCheck();
            }
          }, 100);
        };
        doCheck();
      });
      await waitForStop();
      expect(mock).toBeCalledTimes(1);
      expect(taskRunner.running).toBeFalsy();
    });
  });

  describe('respects run conditions', () => {
    const someCondtion = { val: true };
    const fakeCondtionChecker = () => someCondtion.val;
    let taskRunner;
    beforeEach(() => {
      taskRunner = new TaskRunner(
        { Task: LongRunningTask, runConditions: [fakeCondtionChecker], conditionCheckRate: 100 },
      );
      someCondtion.val = true;
    });
    afterEach(async () => {
      await taskRunner.stop();
      await taskRunner.closeDb();
    });

    it('runs task when conditon is true', async () => {
      await taskRunner.start();
      taskRunner.addTask(0);
      await taskRunner.stop();
      expect(mock).toBeCalledTimes(1);
    });

    it("Doesn't run when condition is not met", async () => {
      someCondtion.val = false;
      await taskRunner.start();
      expect(taskRunner.running).toBeFalsy();
      await taskRunner.addTask(0);
      expect(mock).toBeCalledTimes(0);
    });

    describe('condition checking', () => {
      it('it runs tasks after condition becomes true manually', async () => {
        someCondtion.val = false;
        await taskRunner.start();
        taskRunner.addTask(0);
        await taskRunner.stop();
        expect(taskRunner.running).toBeFalsy();
        expect(mock).toBeCalledTimes(0);
        someCondtion.val = true;
        await taskRunner.start();
        expect(taskRunner.running).toBeTruthy();
        await taskRunner.stop();
        expect(mock).toBeCalledTimes(1);
        expect(taskRunner.getAllTasksFromDb().length).toBe(0);
      });

      it('it runs the task after condition change automatically', async () => {
        someCondtion.val = false;
        await taskRunner.start();
        await taskRunner.addTask(0);
        expect(mock).toBeCalledTimes(0);
        expect(taskRunner.getAllTasksFromDb().length).toBe(1);
        expect(taskRunner.running).toBeFalsy();
        // change condition mid run
        const conditionCheckDuration = () => new Promise((resolve) => setTimeout(resolve, 200));
        someCondtion.val = true;
        await conditionCheckDuration();
        expect(taskRunner.running).toBeTruthy();
        await taskRunner.stop();
        expect(mock).toBeCalledTimes(1);
        expect(taskRunner.getAllTasksFromDb().length).toBe(0);
      });
    });
  });


  describe('Task args', () => {
    const useArg = jest.fn();

    class ArgTask extends GuaranteedTask {
      start() {
        useArg(this.args);
      }
    }

    let taskRunner;
    beforeEach(() => {
      taskRunner = new TaskRunner(
        { Task: ArgTask },
      );
    });
    afterEach(async () => {
      await taskRunner.stop();
      taskRunner.closeDb();
    });
    it('can use numbers, strings and simple objects', async () => {
      await taskRunner.start();
      await taskRunner.addTask(1000);
      expect(useArg).toBeCalledWith(1000);
    });
    it('can use strings', async () => {
      await taskRunner.start();
      await taskRunner.addTask('arg');
      expect(useArg).toBeCalledWith('arg');
    });
    it('can use simple objects', async () => {
      const someObj = { obj: 'a' };
      await taskRunner.addTask(someObj); // add to db
      await taskRunner.start(); // run from db
      await taskRunner.stop(); // wait for it to finish
      expect(useArg).toBeCalledWith(someObj);
    });
  });


  describe('dependency option', () => {
    const dependency = {
      func: jest.fn(),
    };

    class DependableTask extends GuaranteedTask {
      start() {
        this.dependency.func(this.args);
      }
    }
    let taskRunner;
    beforeEach(() => {
      taskRunner = new TaskRunner(
        { Task: DependableTask, dependency },
      );
    });
    afterEach(async () => {
      await taskRunner.stop();
      taskRunner.closeDb();
    });
    it('task can use dependency', async () => {
      await taskRunner.start();
      taskRunner.addTask('args');
      expect(dependency.func).toBeCalledTimes(1);
      expect(dependency.func).toBeCalledWith('args');
    });
  });
});
