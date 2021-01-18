/* eslint-disable max-classes-per-file */
import { TaskRunner, TaskChain } from '../../src/index';
import { waitForNextLoop } from '../utils';
import CreateNormalTask from '../NormalTask';
import CreateChainTask from '../ChainTask';

describe('task chain normal', () => {
  const mock = jest.fn();
  const NormalTask = CreateNormalTask(mock);
  const ChainTask = CreateChainTask(mock);

  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [ChainTask, NormalTask],
      dbOptions: { name: ':memory:' },
    });
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });

  it('Runs all tasks of the chain', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(
      new TaskChain(NormalTask, 'first')
        .add(NormalTask, 'second')
        .add(NormalTask, 'third'),
    );
    await waitForNextLoop(5);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith('first');
    expect(mock).toBeCalledWith('second');
    expect(mock).toBeCalledWith('third');
  });

  it('Passes args to the next', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(
      new TaskChain(ChainTask, 1).add(ChainTask).add(ChainTask),
    );
    await waitForNextLoop(5);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(1);
    expect(mock).toBeCalledWith(2);
    expect(mock).toBeCalledWith(3);
  });

  it("doesn't pass args to the next if next task has args set", async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(
      new TaskChain(ChainTask, 1).add(ChainTask).add(ChainTask, 5),
    );
    await waitForNextLoop(5);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(1);
    expect(mock).toBeCalledWith(2);
    expect(mock).toBeCalledWith(5);
  });
});

describe('task chain debug', () => {
  const mock = jest.fn();
  const NormalTask = CreateNormalTask(mock);
  const ChainTask = CreateChainTask(mock);

  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [ChainTask, NormalTask],
      dbOptions: { name: ':memory:' },
      debug: {
        runLimit: 1,
      },
    });
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });

  it("doesn't run until started", async () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(
      new TaskChain(ChainTask, 1).add(ChainTask).add(ChainTask),
    );
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(2);
    expect(mock).toBeCalledWith(2);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(3);
  });

  it('continues chain after restart', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(
      new TaskChain(ChainTask, 1).add(ChainTask).add(ChainTask),
    );
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(2);
    expect(mock).toBeCalledWith(2);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(3);
  });

  it('continues chain properly with interruptions', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(
      new TaskChain(ChainTask, 1).add(ChainTask).add(ChainTask),
    );
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(2);
    expect(mock).toBeCalledWith(2);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(3);
  });

  it('removes rest of the chain if a failed task removes itself', async () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    await taskRunner.execute(
      new TaskChain(ChainTask, 1) // 1
        .add(ChainTask) // 2
        .add(ChainTask) // 3
        .add(ChainTask) // 4 and fail on this one
        .add(ChainTask) // 5
        .add(ChainTask), // 6
    );
    expect(mock).toBeCalledTimes(0);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(1);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(2);
    expect(mock).toBeCalledWith(2);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(3);
    // 3 should remain
    expect(taskRunner.db.getAllTasks().length).toBe(3);

    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(4);
    expect(mock).toBeCalledWith(4);
    // since it failed on 4th and got removed, 5th and 6th should be removed
    // which makes it 0;
    expect(taskRunner.db.getAllTasks().length).toBe(0);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(4);
    expect(mock).toBeCalledWith(4);
    await taskRunner.start();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(4);
    expect(mock).toBeCalledWith(4);
  });
});
