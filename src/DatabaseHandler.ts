import fs from 'fs';
import path from 'path';
import BSqlite3 from 'better-sqlite3';

export type DatabaseHandlerOptions = {
  /** filename of task database */
  name?: string;
} & BSqlite3.Options;

type TaskShort = {
  id: number;
  next_task_id: number | null;
};
type TaskLong = TaskShort & {
  name: string;
  attempt: number;
  args: string | null;
};

type Task = TaskLong & {
  has_parent: number | null;
};

export default class DatabaseHandler {
  filename: string;

  db: BSqlite3.Database;

  /* eslint-disable @typescript-eslint/no-explicit-any */

  insertTaskStmt: BSqlite3.Statement<any[]>;

  removeTaskStmt: BSqlite3.Statement<any[]>;

  updateTaskArgsIfNullStmt: BSqlite3.Statement<any[]>;

  clearTaskParentIdStmt: BSqlite3.Statement<any[]>;

  getAllRootTasksStmt: BSqlite3.Statement<any[]>;

  getAllTasksStmt: BSqlite3.Statement<any[]>;

  getTaskStmt: BSqlite3.Statement<any[]>;

  getTaskInfoStmt: BSqlite3.Statement<any[]>;

  increaseTaskAttemptStmt: BSqlite3.Statement<any[]>;

  /* eslint-enable @typescript-eslint/no-explicit-any */

  constructor(options: DatabaseHandlerOptions = {}) {
    if (options.name) {
      if (options.name === ':memory:') {
        this.filename = options.name;
      } else {
        this.filename = path.join(process.cwd(), 'data', options.name);
      }
    } else {
      this.filename = path.join(process.cwd(), 'data', 'TaskRunner.sqlite3');
    }
    if (this.filename !== ':memory:') {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
      }
    }

    this.db = new BSqlite3(this.filename, options);
    this.db.pragma('journal_mode = WAL');

    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "args" TEXT DEFAULT NULL,
        "attempt" INTEGER NOT NULL DEFAULT 0,
        "next_task_id" INTEGER DEFAULT NULL,
        "has_parent" INTEGER DEFAULT NULL
      );
    `,
      )
      .run();

    this.insertTaskStmt = this.db.prepare(
      'INSERT INTO "tasks" (name, args, next_task_id, has_parent) VALUES (?,?,?,?)',
    );
    this.removeTaskStmt = this.db.prepare('DELETE FROM "tasks" WHERE id = ?');
    this.updateTaskArgsIfNullStmt = this.db.prepare(
      'UPDATE "tasks" SET args = ? WHERE id = ? AND args IS NULL',
    );
    this.clearTaskParentIdStmt = this.db.prepare(
      'UPDATE "tasks" SET has_parent = NULL WHERE id = ?',
    );
    this.getAllRootTasksStmt = this.db.prepare(
      'SELECT * from "tasks" WHERE has_parent IS NULL',
    );
    this.getAllTasksStmt = this.db.prepare('SELECT * from "tasks"');
    this.getTaskStmt = this.db.prepare(
      'SELECT id,next_task_id from "tasks" WHERE id = ?',
    );
    this.getTaskInfoStmt = this.db.prepare(
      'SELECT id,name,args,attempt,next_task_id from "tasks" WHERE id = ?',
    );
    this.increaseTaskAttemptStmt = this.db.prepare(
      'UPDATE "tasks" SET attempt = attempt + 1 WHERE id = ?',
    );
  }

  close(): BSqlite3.Database {
    return this.db.close();
  }

  insertTask(
    taskName: string,
    args: string | null = null,
    nextTaskId: number | null = null,
    hasParent: number | null = null,
  ): BSqlite3.RunResult {
    return this.insertTaskStmt.run(taskName, args, nextTaskId, hasParent);
  }

  removeTask(taskId: number): BSqlite3.RunResult {
    return this.removeTaskStmt.run(taskId);
  }

  removeTaskRecursive(taskId: number): void {
    const task = this.getTask(taskId);
    if (task.next_task_id) {
      this.removeTaskRecursive(task.next_task_id);
    }
    this.removeTask(taskId);
  }

  getTask(taskId: number): TaskShort {
    return this.getTaskStmt.get(taskId) as TaskShort;
  }

  getTaskInfo(taskId: number): TaskLong {
    return this.getTaskInfoStmt.get(taskId) as TaskLong;
  }

  updateTaskArgsIfNull(taskId: number, args: unknown): BSqlite3.RunResult {
    return this.updateTaskArgsIfNullStmt.run(JSON.stringify(args), taskId);
  }

  clearTaskParentId(taskId: number): BSqlite3.RunResult {
    return this.clearTaskParentIdStmt.run(taskId);
  }

  getAllRootTasks(): Array<Task> {
    return this.getAllRootTasksStmt.all() as Array<Task>;
  }

  // for tests
  getAllTasks(): Array<Task> {
    return this.getAllTasksStmt.all() as Array<Task>;
  }

  increaseTaskAttempt(taskId: number): BSqlite3.RunResult {
    return this.increaseTaskAttemptStmt.run(taskId);
  }
}
