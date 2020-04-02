const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

class DB {
  constructor(options = {}) {
    if (!options.name) {
      // eslint-disable-next-line no-param-reassign
      options.name = 'TaskRunner.sqlite3';
    }
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    this.db = new Database(path.join(process.cwd(), 'data', options.name), options);
    this.db.pragma('journal_mode = WAL');

    this.createTaskTableStmt = this.db
      .prepare(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "args" TEXT DEFAULT NULL,
        "attempt" INTEGER NOT NULL DEFAULT 0,
        "next_task_id" INTEGER,
        "has_parent" INTEGER DEFAULT NULL
      );
    `).run();

    this.insertTaskStmt = this.db.prepare('INSERT INTO "tasks" (name, args, next_task_id, has_parent) VALUES (?,?,?,?)');
    this.removeTaskStmt = this.db.prepare('DELETE FROM "tasks" WHERE id = ?');
    this.updateTaskArgsIfNullStmt = this.db.prepare('UPDATE "tasks" SET args = ? WHERE id = ? AND args IS NULL');
    this.clearTaskParentIdStmt = this.db.prepare('UPDATE "tasks" SET has_parent = NULL WHERE id = ?');
    this.getAllRootTasksStmt = this.db.prepare('SELECT * from "tasks" WHERE has_parent IS NULL');
    this.getAllTasksStmt = this.db.prepare('SELECT * from "tasks"');
    this.getTaskStmt = this.db.prepare('SELECT id,next_task_id from "tasks" WHERE id = ?');
    this.getTaskInfoStmt = this.db.prepare('SELECT id,name,args,attempt,next_task_id from "tasks" WHERE id = ?');
    this.increaseTaskAttemptStmt = this.db.prepare('UPDATE "tasks" SET attempt = attempt + 1 WHERE id = ?');
  }

  close() {
    return this.db.close();
  }

  insertTask(taskName, args = null, nextTaskId = null, hasParent = null) {
    return this.insertTaskStmt.run(taskName, args, nextTaskId, hasParent);
  }

  removeTask(taskId) {
    return this.removeTaskStmt.run(taskId);
  }

  removeTaskRecursive(taskId) {
    const task = this.getTask(taskId);
    if (task.next_task_id) {
      this.removeTaskRecursive(task.next_task_id);
    }
    this.removeTask(taskId);
  }

  getTask(taskId) {
    return this.getTaskStmt.get(taskId);
  }

  getTaskInfo(taskId) {
    return this.getTaskInfoStmt.get(taskId);
  }

  updateTaskArgsIfNull(taskId, args) {
    return this.updateTaskArgsIfNullStmt.run(JSON.stringify(args), taskId);
  }

  clearTaskParentId(taskId) {
    return this.clearTaskParentIdStmt.run(taskId);
  }

  getAllRootTasks() {
    return this.getAllRootTasksStmt.all();
  }

  // for tests
  getAllTasks() {
    return this.getAllTasksStmt.all();
  }

  increaseTaskAttempt(taskId) {
    return this.increaseTaskAttemptStmt.run(taskId);
  }
}

module.exports = DB;
