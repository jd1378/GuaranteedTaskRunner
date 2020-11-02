/* eslint-disable max-classes-per-file */
import { GuaranteedTask, TaskRunner } from '../../src/index';
import { wait } from '../utils';
import LogTask from '../LogTask';
import CreateWaitTask from '../WaitTask';
import CreatFailTask from '../FailTask';
import CreatFailAddTask from '../FailAddTask';
import CreatNormalTask from '../NormalTask';
import CreatFailedAttemptsTask from '../FailedAttemptsTask';

const mock = jest.fn();
const WaitTask = CreateWaitTask(mock);
const NormalTask = CreatNormalTask(mock);
const FailTask = CreatFailTask(mock);
const FailAddTask = CreatFailAddTask(mock);
const FailedAttemptsTask = CreatFailedAttemptsTask(mock);

describe('general', () => {
  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [
        WaitTask,
        NormalTask,
        FailTask,
        LogTask,
        FailAddTask,
        FailedAttemptsTask,
      ],
      dbOptions: { name: ':memory:' },
      dependency: taskRunner,
      taskFailureDelay: 3000,
    });
    mock.mockClear();
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });

  it('waits for running tasks to finish after calling stop', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(WaitTask, 1000).exec();
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(WaitTask, 1).exec();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(NormalTask).exec();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(WaitTask, 100).exec();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(taskRunner.db.getAllTasks().length).toBe(0);
  });

  it('passes error to onFailure', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(FailTask, 'test error message').exec();
    await taskRunner.stop();
    expect(mock).toBeCalledWith(new Error('test error message'));
    expect(taskRunner.db.getAllTasks().length).toBe(1);
  });

  it('retries a task on failure', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(FailTask, 'test error message').exec();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(new Error('test error message'));
    expect(taskRunner.db.getAllTasks().length).toBe(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(2);
  });

  it('respects task failure delay option', async () => {
    await taskRunner.start();
    await taskRunner.add(FailTask, 'test error message').exec();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(new Error('test error message'));
    expect(taskRunner.db.getAllTasks().length).toBe(1);
    await wait(2500);
    expect(mock).toBeCalledTimes(1);
    await wait(600);
    expect(mock).toBeCalledTimes(2);
    expect(mock).toBeCalledWith(new Error('test error message'));
    expect(taskRunner.db.getAllTasks().length).toBe(1);
  });

  it('increases task attempt on failure', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(FailedAttemptsTask).exec();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(0);
    expect(taskRunner.db.getAllTasks().length).toBe(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledWith(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledWith(2);
  });

  it('can add another task on failure using the exposed taskRunner', async () => {
    console.log = jest.fn();
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(FailAddTask, 'test error message').exec();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(new Error('test error message'));
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(console.log).toBeCalledWith('anotherran');
    expect(taskRunner.db.getAllTasks().length).toBe(0);
  });
});

describe('Task args', () => {
  const useArg = jest.fn();

  class ArgTask extends GuaranteedTask {
    start() {
      useArg(this.args);
    }
  }

  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [ArgTask],
      dbOptions: { name: ':memory:' },
    });
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });
  it('can use numbers, strings and simple objects', async () => {
    await taskRunner.add(ArgTask, 1000).exec(); // add to db
    await taskRunner.start(); // run from db
    await taskRunner.stop(); // wait for it to finish
    expect(useArg).toBeCalledWith(1000);
  });
  it('can use strings', async () => {
    await taskRunner.add(ArgTask, 'arg').exec(); // add to db
    await taskRunner.start(); // run from db
    await taskRunner.stop(); // wait for it to finish
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.dependency.func(this.args);
    }
  }
  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [DependableTask],
      dependency,
      dbOptions: { name: ':memory:' },
    });
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
