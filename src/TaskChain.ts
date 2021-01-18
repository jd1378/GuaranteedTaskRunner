import GuaranteedTask from './GuaranteedTask';
import Plan from './Plan';

class TaskChain {
  public items: Array<Plan>;

  constructor(Task?: typeof GuaranteedTask, args?: unknown) {
    this.items = [];
    if (Task) {
      this.add(Task, args);
    }
  }

  add(Task: typeof GuaranteedTask, args?: unknown): TaskChain {
    this.items.push({ taskName: Task.name, args });
    return this;
  }
}

export default TaskChain;
