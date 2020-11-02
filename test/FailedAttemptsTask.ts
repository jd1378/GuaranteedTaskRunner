import { GuaranteedTask } from '../src/index';

export default function FailedAttemptsTaskClass(
  mock: (args: unknown) => void,
): typeof GuaranteedTask {
  class FailedAttemptsTask extends GuaranteedTask {
    start() {
      throw new Error(this.args as string);
    }

    onFailure() {
      mock(this.attempt);
    }
  }
  return FailedAttemptsTask;
}
