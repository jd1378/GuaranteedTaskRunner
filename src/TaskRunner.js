/* eslint-disable no-underscore-dangle */
/**
 * @typedef {import('./GuaranteedTask')} GuaranteedTask
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const nodeCleanup = require('node-cleanup');
const ConditionRunner = require('./ConditionRunner');

function defer() {
  let res;
  let rej;

  const promise = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });

  promise.resolve = res;
  promise.reject = rej;

  return promise;
}

class TaskRunner {
  /**
   * Define the task, give the args and it guarantees to run.
   *
   * @param {Object} options
   * @param {GuaranteedTask} options.Task
   * Class to use when constructing task.
   * Must extend Guaranteed Task.
   *
   * @param {*} options.dependency
   * possible dependency that is needed during a task
   *
   * @param {Array} options.runConditions
   * an array of functions that returns truthy or falsey values.
   * functions can be async or return promise.
   * Note that this is the global run conditions for all tasks
   *
   * @param {Number} options.conditionCheckRate
   * rate of running checks in milliseconds
   *
   * @param {Number} options.taskFailureDelay
   * delay in milliseconds to restart the task when it fails.
   */
  constructor({
    Task,
    dependency = null,
    runConditions = [],
    conditionCheckRate = 10 * 1000,
    taskFailureDelay = 10 * 1000,
  }) {
    this.Task = Task;
    this.dependency = dependency;
    this.taskFailureDelay = taskFailureDelay;
    this.removeTaskFromDb = this.removeTaskFromDb.bind(this);
    this.runningTasks = new Map();
    this.running = false;
    this.stopping = false;
    this.setupDb();

    this.conditionRunner = new ConditionRunner({
      functions: runConditions,
      rate: conditionCheckRate,
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
          this.closeDb();
          cleanedUp = true;
        });
        return false;
      }
      return true;
    });
  }

  /**
   * Adds task to db and runs it
   * @param {*} args
   */
  async addTask(args) {
    const id = this.insertTask(args);
    const task = new this.Task({ id, dependency: this.dependency, args });
    await this.runTask(task);
  }

  /**
   * Runs task with given args
   * @param {GuaranteedTask} task
   */
  async runTask(task) {
    if (!this.running || this.stopping) return;

    if (this.conditionRunner.passes) {
      const currentAction = defer();
      this.runningTasks.set(task.id, currentAction);
      try {
        if (task.attemptNumber > 0) {
          await task.restart();
        } else {
          await task.start();
        }
        this.removeTaskFromDb(task);
        await task.onFinish();
        currentAction.resolve();
        this.runningTasks.delete(task.id);
      } catch (err) {
        const isRemoved = await task.onFailure(this.removeTaskFromDb);
        if (!isRemoved) {
          task.increaseAttempt();
          this.increaseTaskAttempt(task.id);
          currentAction.resolve();
          if (this.running) {
            setTimeout(() => this.runTask(task), this.taskFailureDelay);
          }
        } else {
          currentAction.resolve();
        }
      }
    }
  }

  /**
   * @param {GuaranteedTask} task
   */
  removeTaskFromDb(task) {
    this.taskRemoveStmt.run(task.id);
  }

  insertTask(args) {
    const { lastInsertRowid } = this.taskInsertStmt.run(JSON.stringify(args));
    return lastInsertRowid;
  }

  increaseTaskAttempt(id) {
    this.taskIncreaseAttemptStmt.run(id);
  }

  /**
   * @param {Number} taskid
   */
  getTaskFromDb(taskid) {
    return this.taskGetStmt.get(taskid);
  }

  getAllTasksFromDb() {
    return this.taskAllStmt.all();
  }

  /**
   * Wait for all current running tasks to finish
   */
  _stop() {
    if (!this.running || this.stopping) return Promise.resolve();
    this.running = false;
    this.stopping = true;

    return new Promise((resolve) => {
      // give a gap to loop check for this.running
      process.nextTick(() => {
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

  async _start() {
    if (this.stopping || this.running) return;
    this.running = true;
    await Promise.all(
      this.getAllTasksFromDb()
        .map((taskRow) => new this.Task({
          id: taskRow.id,
          dependency: this.dependency,
          args: JSON.parse(taskRow.args),
        }))
        .map((task) => this.runTask(task)),
    );
  }

  async start() {
    await this.conditionRunner.start();
  }

  setupDb() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    this.db = new Database(path.join(process.cwd(), 'data', `${this.Task.name}.sqlite3`));
    this.db.pragma('journal_mode = WAL');
    this.db
      .prepare(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "args" TEXT DEFAULT '{}',
        "attempt" INTEGER NOT NULL DEFAULT 0
      );
      `).run();
    this.taskInsertStmt = this.db.prepare('INSERT INTO "tasks" (args) VALUES (?)');
    this.taskRemoveStmt = this.db.prepare('DELETE FROM "tasks" WHERE id = ?');
    this.taskGetStmt = this.db.prepare('SELECT * from "tasks" WHERE id = ?');
    this.taskAllStmt = this.db.prepare('SELECT * from "tasks"');
    this.taskIncreaseAttemptStmt = this.db.prepare('UPDATE "tasks" SET attempt = attempt + 1 WHERE id = ?');
  }

  closeDb() {
    this.db.close();
  }
}

module.exports = TaskRunner;
