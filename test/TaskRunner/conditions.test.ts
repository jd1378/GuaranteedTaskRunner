/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable max-classes-per-file */
import { TaskRunner } from '../../src/index';
import CreateWaitTask from '../WaitTask';

const mock = jest.fn();
const WaitTask = CreateWaitTask(mock);

describe('respects run conditions', () => {
  const someCondtion = { val: true };
  const fakeCondtionChecker = () => someCondtion.val;
  let taskRunner: TaskRunner;
  beforeEach(() => {
    taskRunner = new TaskRunner({
      Tasks: [WaitTask],
      runConditions: [fakeCondtionChecker],
      conditionCheckRate: 100,
      dbOptions: { name: ':memory:' },
    });
    someCondtion.val = true;
  });
  afterEach(async () => {
    await taskRunner.stop();
    taskRunner.db.close();
  });

  it('runs task when conditon is met from start', async () => {
    await taskRunner.start();
    taskRunner.add(WaitTask, 0).exec();
    await taskRunner.stop();
    expect(mock).toBeCalledTimes(1);
  });

  it("Doesn't run task when condition is not met", async () => {
    someCondtion.val = false;
    await taskRunner.start();
    expect(taskRunner.running).toBeFalsy();
    await taskRunner.add(WaitTask, 0).exec();
    expect(mock).toBeCalledTimes(0);
  });

  describe('condition checking', () => {
    it('it runs tasks after condition becomes true manually', async () => {
      someCondtion.val = false;
      await taskRunner.start();
      taskRunner.add(WaitTask, 0).exec();
      await taskRunner.stop();
      expect(taskRunner.running).toBeFalsy();
      expect(mock).toBeCalledTimes(0);
      someCondtion.val = true;
      await taskRunner.start();
      expect(taskRunner.running).toBeTruthy();
      await taskRunner.stop();
      expect(mock).toBeCalledTimes(1);
      expect(taskRunner.db.getAllTasks().length).toBe(0);
    });

    it('it runs the task after condition change automatically', async () => {
      someCondtion.val = false;
      await taskRunner.start();
      await taskRunner.add(WaitTask, 0).exec();
      expect(mock).toBeCalledTimes(0);
      expect(taskRunner.db.getAllTasks().length).toBe(1);
      expect(taskRunner.running).toBeFalsy();
      // change condition mid run
      const conditionCheckDuration = () =>
        new Promise((resolve) => setTimeout(resolve, 200));
      someCondtion.val = true;
      await conditionCheckDuration();
      expect(taskRunner.running).toBeTruthy();
      await taskRunner.stop();
      expect(mock).toBeCalledTimes(1);
      expect(taskRunner.db.getAllTasks().length).toBe(0);
    });
  });
});
