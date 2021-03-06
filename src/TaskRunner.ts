/* eslint-disable no-underscore-dangle */
import nodeCleanup from 'node-cleanup';
import DatabaseHandler, { DatabaseHandlerOptions } from './DatabaseHandler';
import ConditionRunner from './ConditionRunner';
import Deffered from './Deffered';
import type GuaranteedTask from './GuaranteedTask';
import Plan from './Plan';
import TaskChain from './TaskChain';

export type TaskRunnerOptions = {
  /** an array containing all classes that this runner gonna use */
  Tasks: Array<typeof GuaranteedTask>;
  /** possible dependency that is needed during a task */
  dependency?: unknown;
  /** an array of functions that returns truthy or falsey values.
   * functions can be async or return promise.
   * Note that this is the global run conditions for all tasks */
  runConditions?: Array<(() => Promise<boolean>) | (() => boolean)>;
  /** rate of running checks in milliseconds. default 10 sec. */
  conditionCheckRate?: number;
  /** delay in milliseconds to restart the task when it fails. default 10 sec. */
  taskFailureDelay?: number;
  dbOptions?: DatabaseHandlerOptions;
  /** Never use this option. special option for debugging and testing. */
  debug?: {
    /** It limits how many tasks can run per start. quota resets per stop. */
    runLimit?: number;
  };
};

export default class TaskRunner {
  Tasks: Array<typeof GuaranteedTask>;

  dependency: unknown;

  taskFailureDelay: number;

  runningTasks: Map<unknown, Deffered<void>>;

  private taskImmediates: Map<unknown, NodeJS.Immediate>;

  private taskTimeouts: Map<unknown, NodeJS.Timeout>;

  running: boolean;

  stopping: boolean;

  startDeffer: Deffered<void>;

  stopDeffer: Deffered<void>;

  private conditionRunner: ConditionRunner;

  db: DatabaseHandler;

  constructor(options: TaskRunnerOptions) {
    if (!options) throw new Error('TaskRunner cannot work without options');
    this.Tasks = options.Tasks;
    this.dependency = options.dependency;
    this.taskFailureDelay = options.taskFailureDelay || 10 * 1000;
    this.runningTasks = new Map<unknown, Deffered<void>>();
    this.taskImmediates = new Map<unknown, NodeJS.Immediate>();
    this.taskTimeouts = new Map<unknown, NodeJS.Timeout>();
    this.running = false;
    this.stopping = false;
    this.startDeffer = new Deffered<void>();
    this.startDeffer.resolve();
    this.stopDeffer = new Deffered<void>();
    this.stopDeffer.resolve();

    /// ///////////////// ///
    //      For  debug     //
    /// ///////////////// ///
    if (options.debug?.runLimit) {
      const { runLimit } = options.debug;
      let quota = runLimit;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const runOrig = this.run.bind(this);
      this.run = (task) => {
        if (quota) {
          if (this.running) {
            quota--;
          }
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line
          return runOrig(task);
        }
        return Promise.resolve();
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const stopOrig = this.stop.bind(this);
      this.stop = async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line
        await stopOrig();
        quota = runLimit;
      };
      /// //////////////////
    }
    // setup db
    this.db = new DatabaseHandler(options.dbOptions);
    // setup condtion checker
    this.conditionRunner = new ConditionRunner({
      runConditions: options.runConditions,
      rate: options.conditionCheckRate,
      startHandle: this._start.bind(this),
      stopHandle: this._stop.bind(this),
    });
    // gracefully shutdown when needed
    let cleanedUp = false;
    let cleaningUp = false;
    nodeCleanup((_exitCode, signal) => {
      if (signal) {
        if (cleanedUp) {
          return true;
        }
        if (cleaningUp) return false;
        cleaningUp = true;
        this.stop()
          .then(() => {
            this.db.close();
            cleanedUp = true;
            process.kill(process.pid, signal);
          })
          .catch(() => {});
        return false;
      }
      return true;
    });
  }

  /**
   * the last planned task gets inserted first,
   * the id and its name gets inserted with the task before it,
   * and so on
   *
   * till the first plan which is the top parent task gets inserted with has_parent as null
   */
  public execute(
    taskChain: TaskChain | typeof GuaranteedTask,
    args?: unknown,
  ): Promise<void> {
    let tasks: Array<Plan>;
    // undefined is thrown automatically
    if ('add' in taskChain) {
      tasks = taskChain.items;
    } else if (taskChain) {
      tasks = [
        {
          taskName: taskChain.name,
          args,
        },
      ];
    } else {
      throw new Error('taskChain is not of type TaskChain or GuaranteedTask');
    }

    if (!tasks) {
      throw new Error('task list is empty');
    }
    let prevTaskId: number | null = null;
    let plan: Plan;
    do {
      plan = tasks.pop() as Plan;
      const hasParent = tasks.length !== 0;
      const { lastInsertRowid } = this.db.insertTask(
        plan.taskName,
        plan.args ? JSON.stringify(plan.args) : null,
        prevTaskId,
        hasParent ? 1 : null,
      );
      if (hasParent) {
        // don't set when it't top parent, to use for running the task
        prevTaskId = lastInsertRowid as number;
      } else {
        plan.id = lastInsertRowid as number;
      }
    } while (tasks.length);
    const TheTask = this.Tasks.find((task) => task.name === plan.taskName);
    if (TheTask) {
      return this.run(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        new TheTask({
          id: plan.id,
          dependency: this.dependency,
          args: plan.args,
          nextTaskId: prevTaskId,
          taskRunner: this,
        }),
      );
    }
    return Promise.reject(
      new Error("Task name not found in runner's Tasks array"),
    );
  }

  /**
   * Runs the defined task
   */
  private async run(task: GuaranteedTask): Promise<void> {
    if (!this.running || this.stopping || !task) return;

    if (this.conditionRunner.passes) {
      const currentAction = new Deffered<void>();
      this.runningTasks.set(task.id, currentAction);
      try {
        let result: unknown;
        if (task.attempt > 0) {
          result = await task.start(true);
        } else {
          result = await task.start(false);
        }
        this.db.removeTask(task.id);
        if (task.nextTaskId) {
          this.db.clearTaskParentId(task.nextTaskId);
          if (result) {
            this.db.updateTaskArgsIfNull(task.nextTaskId, result);
          }
        }
        // no guarantee for finish
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        task.onFinish(result);
        this.runningTasks.delete(task.id);
        currentAction.resolve();
        if (task.nextTaskId) {
          const { nextTaskId } = task;
          await new Promise<void>((resolve) => {
            this.taskImmediates.set(
              nextTaskId,
              setImmediate(() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                resolve(this._runTaskId(nextTaskId));
              }),
            );
          });
        }
      } catch (err) {
        let isRemoved = false;
        const removeTask = () => {
          this.db.removeTaskRecursive(task.id);
          isRemoved = true;
        };

        await task.onFailure(err, removeTask);

        if (isRemoved) {
          currentAction.resolve();
          return;
        }

        task.increaseAttempt();
        this.db.increaseTaskAttempt(task.id);
        currentAction.resolve();
        // unnecessary check I guess
        if (this.running) {
          this.taskTimeouts.set(
            task.id,
            setTimeout(() => {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              this.run(task);
            }, this.taskFailureDelay),
          );
        }
      }
    }
  }

  private async _runTaskId(id: number): Promise<void> {
    if (!this.running || this.stopping) return Promise.resolve();
    const taskInfo = this.db.getTaskInfo(id);
    if (taskInfo) {
      const TheTask = this.Tasks.find((task) => task.name === taskInfo.name);
      if (TheTask) {
        return this.run(
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          new TheTask({
            id,
            dependency: this.dependency,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // because JSON.parse(null) is valid and throws no error.
            args: JSON.parse(taskInfo.args) as unknown,
            attempt: taskInfo.attempt,
            nextTaskId: taskInfo.next_task_id,
            taskRunner: this,
          }),
        );
      }
      // this shouldn't happen if used properly
      return Promise.reject(
        new Error("Task name not found in runner's Tasks array"),
      );
    }
    // this should be caused by execution of chain continuing after runner was told to stop
    return Promise.reject(new Error(`Task info for id ${id} not found`));
  }

  /**
   * Stops executing tasks.
   * Wait for all current running tasks to finish.
   */
  public stop(): Promise<void> {
    this.running = false;
    this.conditionRunner.stop();
    return this._stop();
  }

  private _stop(): Promise<void> {
    if (this.stopping) return this.stopDeffer;
    this.stopping = true;
    this.stopDeffer = new Deffered<void>();
    // clear task chain

    this.taskImmediates.forEach((immediate) => clearImmediate(immediate));
    this.taskImmediates.clear();
    this.taskTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.taskTimeouts.clear();

    return new Promise((resolve) => {
      // wait a loop to run the newly added task after stop
      setImmediate(() => {
        // we don't need promise.allSettled here because all deferred promises are only "resolved"
        // so no need to worry about unhandled rejection.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.all(Array.from(this.runningTasks.values())).then(() => {
          this.stopping = false;
          resolve();
          this.stopDeffer.resolve();
        });
      });
    });
  }

  private async _start(): Promise<void> {
    if (this.running) return this.startDeffer;
    if (this.stopping) return this.stopDeffer;
    this.running = true;
    this.startDeffer = new Deffered<void>();

    await Promise.all(
      this.db
        .getAllRootTasks()
        .map((taskRow) => ({
          TaskClass: this.Tasks.find((Task) => Task.name === taskRow.name),
          taskRow,
        }))
        .filter((data) => !!data.TaskClass)
        .map(
          (data) =>
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            new data.TaskClass({
              id: data.taskRow.id,
              dependency: this.dependency,
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              args: JSON.parse(data.taskRow.args),
              attempt: data.taskRow.attempt,
              nextTaskId: data.taskRow.next_task_id,
              taskRunner: this,
            }),
        )
        .map((task) => this.run(task)),
    );
    this.startDeffer.resolve();
    return this.startDeffer;
  }

  public start(): Promise<void> {
    return this.conditionRunner.start();
  }
}
