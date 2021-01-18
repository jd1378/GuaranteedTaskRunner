import { wait } from '../utils';
/* eslint-disable max-classes-per-file */
import { TaskRunner } from '../../src/index';
import CreateWaitTask from '../WaitTask';

const mock = jest.fn();
const WaitTask = CreateWaitTask(mock);

describe('gracefull shutdown', () => {
  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [WaitTask],
      dbOptions: { name: ':memory:' },
    });
    mock.mockClear();
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });
  it('should wait for task to finish before exiting', async () => {
    const killMock = jest.fn();
    process.kill = killMock;

    await taskRunner.start();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    taskRunner.execute(WaitTask, 1000);
    await wait(100);
    process.emit('SIGTERM', 'SIGTERM');
    const waitForStop = () =>
      new Promise<void>((resolve) => {
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
    expect(killMock).toBeCalledTimes(1);
  });
});
