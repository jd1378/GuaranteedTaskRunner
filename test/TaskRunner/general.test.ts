/* eslint-disable max-classes-per-file */
import { GuaranteedTask, TaskChain, TaskRunner } from '../../src/index';
import { wait } from '../utils';
import LogTask from '../LogTask';
import CreateWaitTask from '../WaitTask';
import CreateFailTask from '../FailTask';
import CreateFailAddTask from '../FailAddTask';
import CreateNormalTask from '../NormalTask';
import CreateFailedAttemptsTask from '../FailedAttemptsTask';
import CreateFailRetrySuccessTask from '../FailRetrySuccessTask';

const mock = jest.fn();
const WaitTask = CreateWaitTask(mock);
const NormalTask = CreateNormalTask(mock);
const FailTask = CreateFailTask(mock);
const FailAddTask = CreateFailAddTask(mock);
const FailedAttemptsTask = CreateFailedAttemptsTask(mock);
const FailRetrySuccessTask = CreateFailRetrySuccessTask(mock);

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
        FailRetrySuccessTask,
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
    taskRunner.execute(WaitTask, 1000);
    await taskRunner.stop();
    expect(taskRunner.running).toBeFalsy();
    expect(mock).toBeCalledTimes(1);
  });

  it('It removes finished tasks properly after finished', async () => {
    await taskRunner.start();
    await taskRunner.execute(WaitTask, 300);
    await taskRunner.execute(NormalTask);
    expect(mock).toBeCalledTimes(2);
    expect(taskRunner.db.getAllTasks().length).toBe(0);
    expect(Array.from(taskRunner.runningTasks.entries()).length).toBe(0);
  });

  it('runs multiple tasks fine', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(WaitTask, 1);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(NormalTask);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(WaitTask, 100);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(taskRunner.db.getAllTasks().length).toBe(0);
  });

  it('passes error to onFailure', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(FailTask, 'test error message');
    await taskRunner.stop();
    expect(mock).toBeCalledWith(new Error('test error message'));
    expect(taskRunner.db.getAllTasks().length).toBe(1);
  });

  it('retries a task on failure', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(FailTask, 'test error message');
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
    await taskRunner.execute(FailTask, 'test error message');
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
    taskRunner.execute(FailedAttemptsTask);
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

  it('calls start() with `true` when attempt is more than 0', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(FailRetrySuccessTask, 'fail');
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(new Error('fail'));
    expect(taskRunner.db.getAllTasks().length).toBe(1);
    expect(taskRunner.db.getAllTasks()[0].attempt).toBe(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(2);
    expect(mock).toBeCalledWith('yes');
    await taskRunner.start();
    await taskRunner.stop();
    expect(taskRunner.db.getAllTasks().length).toBe(0);
  });

  it('can add another task on failure using the exposed taskRunner', async () => {
    console.log = jest.fn();
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(FailAddTask, 'test error message');
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
    await taskRunner.execute(ArgTask, 1000); // add to db
    await taskRunner.start(); // run from db
    await taskRunner.stop(); // wait for it to finish
    expect(useArg).toBeCalledWith(1000);
  });

  it('can use strings', async () => {
    await taskRunner.execute(ArgTask, 'arg'); // add to db
    await taskRunner.start(); // run from db
    await taskRunner.stop(); // wait for it to finish
    expect(useArg).toBeCalledWith('arg');
  });
  it('can use simple objects', async () => {
    const someObj = { obj: 'a' };
    await taskRunner.execute(ArgTask, someObj); // add to db
    await taskRunner.start(); // run from db
    await taskRunner.stop(); // wait for it to finish
    expect(useArg).toBeCalledWith(someObj);
  });

  it('can execute TaskChain with 1 task', async () => {
    await taskRunner.execute(new TaskChain(ArgTask, 1000)); // add to db
    await taskRunner.start(); // run from db
    await taskRunner.stop(); // wait for it to finish
    expect(useArg).toBeCalledWith(1000);
  });

  it('A Task can be awaited during run', async () => {
    await taskRunner.start();
    await taskRunner.execute(ArgTask, 1000); // wait for task to finish
    await taskRunner.stop();
    expect(useArg).toBeCalledWith(1000);
  });

  it('A TaskChain can be awaited during run', async () => {
    await taskRunner.start();
    await taskRunner.execute(new TaskChain(ArgTask, 1000).add(ArgTask, 2000)); // wait for chain to finish
    await taskRunner.stop();
    expect(useArg).toBeCalledWith(1000);
    expect(useArg).toBeCalledWith(2000);
  });

  it('can execute TaskChain with more than 1 task (first form)', async () => {
    await taskRunner.start();
    await taskRunner.execute(
      new TaskChain().add(ArgTask, 1000).add(ArgTask, 2000),
    ); // wait for chain to finish
    await taskRunner.stop();
    expect(useArg).toBeCalledWith(1000);
    expect(useArg).toBeCalledWith(2000);
  });

  it('can execute TaskChain with more than 1 task (second form)', async () => {
    await taskRunner.start();
    await taskRunner.execute(new TaskChain(ArgTask, 1000).add(ArgTask, 2000)); // wait for chain to finish
    await taskRunner.stop();
    expect(useArg).toBeCalledWith(1000);
    expect(useArg).toBeCalledWith(2000);
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
    await taskRunner.execute(DependableTask, 'args');
    expect(dependency.func).toBeCalledTimes(1);
    expect(dependency.func).toBeCalledWith('args');
  });
});
