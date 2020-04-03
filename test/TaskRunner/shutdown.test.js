// @ts-nocheck
/* eslint-disable max-classes-per-file */
const { TaskRunner } = require('../../src/index');

const mock = jest.fn();
const WaitTask = require('../WaitTask')(mock);

describe('gracefull shutdown', () => {
  /**
   * @type {TaskRunner}
   */
  let taskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner(
      { Tasks: [WaitTask], dbOptions: { memory: true } },
    );
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
    expect(killMock).toBeCalledTimes(1);
  });
});
