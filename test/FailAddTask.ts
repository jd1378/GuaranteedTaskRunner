import { GuaranteedTask } from '../src/index';
import LogTask from './LogTask';

export default function FailAddTaskClass(
  mock: (arg0: unknown) => void,
): typeof GuaranteedTask {
  class FailAddTask extends GuaranteedTask {
    start() {
      throw new Error(this.args as string);
    }

    onFailure(error, removeTask: () => void) {
      mock(error);
      removeTask();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.taskRunner.execute(LogTask, 'anotherran');
    }
  }
  return FailAddTask;
}
