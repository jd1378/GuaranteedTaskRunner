/* eslint-disable no-underscore-dangle */
/**
 * @typedef {import('./GuaranteedTask')} GuaranteedTask
 */

const nodeCleanup = require('node-cleanup');
const DB = require('./DB');
const ConditionRunner = require('./ConditionRunner');
const defer = require('./defer');

class TaskRunner {
  /**
   * @param {Object} options
   *
   * @param {Array<GuaranteedTask>} options.Tasks
   * an array containing all classes that this runner gonna use
   *
   * @param {*} options.dependency
   * possible dependency that is needed during a task
   *
   * @param {Array} options.runConditions
   * an array of functions that returns truthy or falsey values.
   * functions can be async or return promise.
   * Note that this is the global run conditions for all tasks
   *
   * @param {Number} [options.conditionCheckRate]
   * rate of running checks in milliseconds. default 10 sec.
   *
   * @param {Number} [options.taskFailureDelay]
   * delay in milliseconds to restart the task when it fails. default 10 sec.
   *
   * @param {Object} options.dbOptions
   * options to pass to better-sqlite3. you can also pass "name" for db name
   */
  constructor(options) {
    if (!options) throw new Error('TaskRunner cannot work without options');
    this.Tasks = options.Tasks;
    this.dependency = options.dependency;
    this.taskFailureDelay = options.taskFailureDelay || 10 * 1000;
    this.runningTasks = new Map();
    this.taskImmediates = new Map();
    this.running = false;
    this.stopping = false;
    // setup db
    this.db = new DB(options.dbOptions);
    // setup condtion checker
    this.conditionRunner = new ConditionRunner({
      functions: options.runConditions,
      rate: options.conditionCheckRate,
      startHandle: this._start.bind(this),
      stopHandle: this._stop.bind(this),
    });
    // gracefully shutdown when needed
    let cleanedUp = false;
    let cleaningUp = false;
    nodeCleanup((exitCode, signal) => {
      if (signal) {
        if (cleanedUp) {
          return true;
        }
        if (cleaningUp) return false;
        cleaningUp = true;
        this.stop().then(() => {
          this.db.close();
          cleanedUp = true;
          process.kill(process.pid, signal);
        });
        return false;
      }
      return true;
    });
  }

  /**
   * Adds task to db and runs it
   * @param {GuaranteedTask} Task - task to run
   * @param {*} args
   */
  add(Task, args, planList = []) {
    planList.push({ taskName: Task.name, args });
    return {
      /**
       * @param {GuaranteedTask} NextTask
       * @param {*} nextTaskArgs
       */
      then: (NextTask, nextTaskArgs) => this.add(NextTask, nextTaskArgs, planList),
      exec: () => this._executePlan(planList),
    };
  }

  /**
   * @description
   * quick explain:
   * the last planned task gets inserted first,
   * the id and its name gets inserted with the task before it,
   * and so on
   *
   * till the last plan which is the top parent task gets inserted with has_parent as null
   * @param {Array} planList
   */
  _executePlan(planList) {
    let prevTaskId = null;
    let plan;
    do {
      plan = planList.pop();
      const hasParent = planList.length !== 0;
      const { lastInsertRowid } = this.db.insertTask(
        plan.taskName,
        plan.args ? JSON.stringify(plan.args) : null,
        prevTaskId,
        hasParent ? 1 : null,
      );
      if (hasParent) {
        // don't set when it't top parent, to use for running the task
        prevTaskId = lastInsertRowid;
      } else {
        plan.id = lastInsertRowid;
      }
    } while (planList.length);
    const TheTask = this.Tasks.find((task) => task.name === plan.taskName);
    if (TheTask) {
      return this.run(new TheTask({
        id: plan.id,
        dependency: this.dependency,
        args: plan.args,
        nextTaskId: prevTaskId,
        taskRunner: this,
      }));
    }
    return Promise.reject(new Error("Task name not found in runner's Tasks array"));
  }

  /**
   * Runs task with given args
   * @param {GuaranteedTask} task
   */
  async run(task) {
    if (!this.running || this.stopping) return;

    if (this.conditionRunner.passes) {
      const currentAction = defer();
      this.runningTasks.set(task.id, currentAction);
      try {
        let result;
        if (task.attemptNumber > 0) {
          result = await task.restart();
        } else {
          result = await task.start();
        }
        this.db.removeTask(task.id);
        if (task.nextTaskId) {
          this.db.clearTaskParentId(task.nextTaskId);
          if (result) {
            this.db.updateTaskArgsIfNull(task.nextTaskId, result);
          }
        }
        // no guarantee for finish
        task.onFinish(result);
        this.runningTasks.delete(task.id);
        currentAction.resolve();
        if (task.nextTaskId) {
          this.taskImmediates.set(task.nextTaskId, setImmediate(() => this._runTaskId(task.nextTaskId)));
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
          this.taskImmediates.set(task.id, setImmediate(() => this.run(task), this.taskFailureDelay));
        }
      }
    }
  }

  async _runTaskId(id) {
    if (!this.running || this.stopping) return Promise.resolve();
    const taskInfo = this.db.getTaskInfo(id);
    if (taskInfo) {
      const TheTask = this.Tasks.find((task) => task.name === taskInfo.name);
      if (TheTask) {
        return this.run(new TheTask({
          id,
          dependency: this.dependency,
          args: JSON.parse(taskInfo.args),
          attempt: taskInfo.attempt,
          nextTaskId: taskInfo.next_task_id,
          taskRunner: this,
        }));
      }
      // this shouldn't happen if used properly
      return Promise.reject(new Error("Task name not found in runner's Tasks array"));
    }
    // this should be caused by execution of chain continuing after runner was told to stop
    return Promise.reject(new Error(`Task info for id ${id} not found`));
  }

  /**
   * Wait for all current running tasks to finish
   */
  _stop() {
    if (!this.running || this.stopping) return Promise.resolve();
    this.running = false;
    this.stopping = true;
    // clear task chain

    this.taskImmediates.forEach((immediate) => clearImmediate(immediate));
    this.taskImmediates.clear();

    return new Promise((resolve) => {
      // wait a loop
      setImmediate(() => {
        Promise.all(Array.from(this.runningTasks.values())).then(() => {
          this.stopping = false;
          resolve();
        });
      });
    });
  }

  stop() {
    this.conditionRunner.stop();
    return this._stop();
  }

  /**
   * @param {Array<GuaranteedTask>} Tasks
   */
  async _start() {
    if (this.stopping || this.running) return;
    this.running = true;
    await Promise.all(
      this.db.getAllRootTasks()
        .map(
          (taskRow) => ({
            TaskClass: this.Tasks.find((Task) => Task.name === taskRow.name),
            taskRow,
          }),
        )
        .filter((data) => !!data.TaskClass)
        .map((data) => new data.TaskClass({
          id: data.taskRow.id,
          dependency: this.dependency,
          args: JSON.parse(data.taskRow.args),
          attempt: data.taskRow.attempt,
          nextTaskId: data.taskRow.next_task_id,
          taskRunner: this,
        }))
        .map((task) => this.run(task)),
    );
  }

  async start() {
    await this.conditionRunner.start();
  }
}

module.exports = TaskRunner;
