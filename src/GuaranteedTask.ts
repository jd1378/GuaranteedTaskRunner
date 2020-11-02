/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line max-classes-per-file
import type TaskRunner from './TaskRunner';

export type GuaranteedTaskOptions = {
  /** id of task inside database */
  id: number;
  /** arguments of task */
  args: unknown;
  /** task name to use when inserting to database. defaults to constructor.name */
  name?: string;
  /** id of next task if successful */
  nextTaskId: number;
  /** how many times this task has failed before */
  attempt?: number;
  /** the dependency that may be accessed inside your task */
  dependency?: unknown;
  /** TaskRunner instance that is running this task */
  taskRunner: TaskRunner;
};

export default abstract class GuaranteedTask {
  attempt: number;

  id: number;

  name: string;

  nextTaskId: number;

  args: unknown;

  dependency: unknown;

  taskRunner: TaskRunner;

  constructor(options: GuaranteedTaskOptions) {
    this.id = options.id;
    this.args = options.args;
    this.name = options.name || this.constructor.name;
    this.nextTaskId = options.nextTaskId;
    this.dependency = options.dependency;
    this.taskRunner = options.taskRunner;
    this.attempt = options.attempt || 0;
  }

  increaseAttempt(): void {
    this.attempt++;
  }

  /**
   * @param retrying true if attempt > 0
   */
  abstract start(retrying: boolean): Promise<unknown> | unknown;

  /**
   * @param _error - The error raised by start() or restart() function
   * @param _removeTaskFromDB - a function that removes the current task if called
   */
  onFailure(
    _error: Error | undefined,
    _removeTaskFromDB: () => void,
  ): Promise<void> | void {}

  /**
   * Make sure you don't throw any errors here. because that would ruin the logic.
   * @param _result - returned result by start() or restart()
   */
  onFinish(_result: unknown): Promise<void> | void {}
}
