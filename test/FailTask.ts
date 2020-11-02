import { GuaranteedTask } from '../src/index';

export default function FailTaskClass(
  mock: (args: unknown) => void,
): typeof GuaranteedTask {
  class FailTask extends GuaranteedTask {
    start() {
      throw new Error(this.args as string);
    }

    onFailure(error) {
      mock(error);
    }
  }
  return FailTask;
}
