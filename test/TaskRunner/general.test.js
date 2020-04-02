// @ts-nocheck
/* eslint-disable max-classes-per-file */
const { GuaranteedTask, TaskRunner } = require('../../src/index');

const mock = jest.fn();
const WaitTask = require('../WaitTask')(mock);
const NormalTask = require('../NormalTask')(mock);

describe('general', () => {
  /**
   * @type {TaskRunner}
   */
  let taskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner(
      { Tasks: [WaitTask, NormalTask], dbOptions: { memory: true } },
    );
    mock.mockClear();
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });

  it('waits for running tasks to finish after calling stop', async () => {
    await taskRunner.start();
    taskRunner.add(WaitTask, 300).exec();
    await taskRunner.stop();
    expect(taskRunner.running).toBeFalsy();
    expect(mock).toBeCalledTimes(1);
  });

  it('It removes finished tasks properly after finished', async () => {
    await taskRunner.start();
    await taskRunner.add(WaitTask, 300).exec();
    await taskRunner.add(NormalTask).exec();
    expect(mock).toBeCalledTimes(2);
    expect(taskRunner.db.getAllTasks().length).toBe(0);
    expect(Array.from(taskRunner.runningTasks.entries()).length).toBe(0);
  });

  it('runs multiple tasks fine', async () => {
    await taskRunner.start();
    taskRunner.add(WaitTask, 1).exec();
    taskRunner.add(NormalTask).exec();
    taskRunner.add(WaitTask, 100).exec();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(taskRunner.db.getAllTasks().length).toBe(0);
  });

  it('should shut down gracefully', async () => {
    await taskRunner.start();
    taskRunner.add(WaitTask, 1000).exec();
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
      { Tasks: [ArgTask], dbOptions: { memory: true } },
    );
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });
  it('can use numbers, strings and simple objects', async () => {
    await taskRunner.start();
    await taskRunner.add(ArgTask, 1000).exec();
    expect(useArg).toBeCalledWith(1000);
  });
  it('can use strings', async () => {
    await taskRunner.start();
    await taskRunner.add(ArgTask, 'arg').exec();
    expect(useArg).toBeCalledWith('arg');
  });
  it('can use simple objects', async () => {
    const someObj = { obj: 'a' };
    await taskRunner.add(ArgTask, someObj).exec(); // add to db
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
      { Tasks: [DependableTask], dependency, dbOptions: { memory: true } },
    );
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });
  it('task can use dependency', async () => {
    await taskRunner.start();
    await taskRunner.add(DependableTask, 'args').exec();
    expect(dependency.func).toBeCalledTimes(1);
    expect(dependency.func).toBeCalledWith('args');
  });
});
