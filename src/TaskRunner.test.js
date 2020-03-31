/* eslint-disable max-classes-per-file */

const fs = require('fs');
const path = require('path');
const GuaranteedTask = require('./GuaranteedTask');
const TaskRunner = require('./TaskRunner');

function deleteFolderRecursive(pathArg) {
  let files = [];
  if (fs.existsSync(pathArg)) {
    files = fs.readdirSync(pathArg);
    files.forEach((file) => {
      const curPath = path.join(pathArg, file);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(pathArg);
  }
}

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
    deleteFolderRecursive(path.join(process.cwd(), 'data'));
  });

  it('waits for running tasks to finish after calling stop', async () => {
    const taskRunner = new TaskRunner(
      { Task: LongRunningTask },
    );
    await taskRunner.start();
    taskRunner.addTask(300);
    await taskRunner.stop();
    expect(taskRunner.running).toBeFalsy();
    expect(mock).toBeCalledTimes(1);

    // cleanup
    taskRunner.closeDb();
  });

  it('It removes finished tasks properly after finished', async () => {
    const taskRunner = new TaskRunner(
      { Task: LongRunningTask },
    );
    await taskRunner.start();
    await taskRunner.addTask(300);
    expect(taskRunner.getAllTasksFromDb().length).toBe(0);
    expect(Array.from(taskRunner.runningTasks.entries()).length).toBe(0);
    // cleanup
    await taskRunner.stop();
    taskRunner.closeDb();
  });

  it('runs multiple tasks fine', async () => {
    const taskRunner = new TaskRunner(
      { Task: LongRunningTask },
    );
    await taskRunner.start();
    taskRunner.addTask(1);
    taskRunner.addTask(10);
    taskRunner.addTask(100);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(taskRunner.getAllTasksFromDb().length).toBe(0);
    // cleanup
    taskRunner.closeDb();
  });

  describe('respects run conditions', () => {
    it('runs task when conditon is true', async () => {
      const obj = { val: true };
      const fakeCondtionChecker = () => obj.val;
      const taskRunner = new TaskRunner(
        { Task: LongRunningTask, runConditions: [fakeCondtionChecker] },
      );
      await taskRunner.start();
      taskRunner.addTask(0);
      await taskRunner.stop();
      expect(mock).toBeCalledTimes(1);
      // cleanup
      taskRunner.closeDb();
    });

    it("Doesn't run when condition is not met", async () => {
      const obj = { val: false };
      const fakeCondtionChecker = () => obj.val;
      const taskRunner = new TaskRunner(
        { Task: LongRunningTask, runConditions: [fakeCondtionChecker] },
      );
      await taskRunner.start();
      expect(taskRunner.running).toBeFalsy();
      await taskRunner.addTask(0);
      expect(mock).toBeCalledTimes(0);
      await taskRunner.stop();
      // cleanup
      taskRunner.closeDb();
    });

    describe('runs task after condition is changed', () => {
      it('manual stop start', async () => {
        const obj = { val: false };
        const fakeCondtionChecker = () => obj.val;
        const taskRunner = new TaskRunner(
          { Task: LongRunningTask, runConditions: [fakeCondtionChecker] },
        );
        await taskRunner.start();
        taskRunner.addTask(0);
        expect(taskRunner.running).toBeFalsy();
        expect(mock).toBeCalledTimes(0);
        await taskRunner.stop();
        obj.val = true;
        await taskRunner.start();
        expect(taskRunner.running).toBeTruthy();
        await taskRunner.stop();
        expect(mock).toBeCalledTimes(1);
        // cleanup
        taskRunner.closeDb();
      });

      it('automatic detection', async () => {
        const obj = { val: false };
        const fakeCondtionChecker = () => obj.val;
        const taskRunner = new TaskRunner(
          { Task: LongRunningTask, runConditions: [fakeCondtionChecker], conditionCheckRate: 100 },
        );
        await taskRunner.start();
        taskRunner.addTask(0);
        expect(mock).toBeCalledTimes(0);
        expect(taskRunner.getAllTasksFromDb().length).toBe(1);
        expect(taskRunner.running).toBeFalsy();
        // change condition mid run
        const conditionCheckDuration = () => new Promise((resolve) => setTimeout(resolve, 200));
        obj.val = true;
        await conditionCheckDuration();
        expect(taskRunner.running).toBeTruthy();
        await taskRunner.stop();
        expect(mock).toBeCalledTimes(1);
        expect(taskRunner.getAllTasksFromDb().length).toBe(0);
        // cleanup
        taskRunner.closeDb();
      });
    });
  });

  it('should shut down gracefully', async () => {
    const taskRunner = new TaskRunner(
      { Task: LongRunningTask },
    );
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

    // cleanup
    taskRunner.closeDb();
  });

  it('can use numbers, strings and objects as task args', async () => {
    const useArg = jest.fn();

    class ArgTask extends GuaranteedTask {
      start() {
        useArg(this.args);
      }
    }

    const taskRunner = new TaskRunner(
      { Task: ArgTask },
    );
    await taskRunner.start();
    await taskRunner.addTask(1000);
    expect(useArg).toBeCalledWith(1000);

    await taskRunner.addTask('arg');
    expect(useArg).toBeCalledWith('arg');

    const someObj = { obj: 'a' };
    await taskRunner.addTask(someObj);
    expect(useArg).toBeCalledWith(someObj);

    // cleanup
    await taskRunner.stop();
    taskRunner.closeDb();
  });


  it('can use dependency', async () => {
    const dependency = {
      func: jest.fn(),
    };

    class DependableTask extends GuaranteedTask {
      start() {
        this.dependency.func(this.args);
      }
    }

    const taskRunner = new TaskRunner(
      { Task: DependableTask, dependency },
    );
    await taskRunner.start();
    taskRunner.addTask('args');
    expect(dependency.func).toBeCalledTimes(1);
    expect(dependency.func).toBeCalledWith('args');

    // cleanup
    await taskRunner.stop();
    taskRunner.closeDb();
  });
});
