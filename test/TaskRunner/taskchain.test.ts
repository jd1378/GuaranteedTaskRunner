/* eslint-disable max-classes-per-file */
import { TaskRunner } from '../../src/index';
import { waitForNextLoop } from '../utils';
import CreateNormalTask from '../NormalTask';
import CreateChainTask from '../ChainTask';

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

describe('task chaining', () => {
  it('Runs all tasks of the chain', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner
      .add(NormalTask, 'first')
      .then(NormalTask, 'second')
      .then(NormalTask, 'third')
      .exec();
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
    taskRunner.add(ChainTask, 1).then(ChainTask).then(ChainTask).exec();
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
    taskRunner.add(ChainTask, 1).then(ChainTask).then(ChainTask, 5).exec();
    await waitForNextLoop(5);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(1);
    expect(mock).toBeCalledWith(2);
    expect(mock).toBeCalledWith(5);
  });

  it('continues chain after restart', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.add(ChainTask, 1).then(ChainTask).then(ChainTask).exec();
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
    taskRunner.add(ChainTask, 1).then(ChainTask).then(ChainTask).exec();
    await taskRunner.stop();
    await waitForNextLoop(100);
    expect(mock).toBeCalledTimes(1);
    expect(mock).toBeCalledWith(1);
    await taskRunner.start();
    await waitForNextLoop(100);
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(3);
    expect(mock).toBeCalledWith(3);
  });

  it('removes rest of the chain if a failed task removes itself', async () => {
    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner
      .add(ChainTask, 1) // 1
      .then(ChainTask) // 2
      .then(ChainTask) // 3
      .then(ChainTask) // 4 and fail on this one
      .then(ChainTask) // 5
      .then(ChainTask) // 6
      .exec();
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
