import { GuaranteedTask } from '../src/index';

export default function FailRetrySuccessTaskClass(
  mock: (args: unknown) => void,
): typeof GuaranteedTask {
  class FailRetrySuccessTask extends GuaranteedTask {
    start(retrying) {
      if (retrying) {
        mock('yes');
      } else {
        throw new Error(this.args as string);
      }
    }

    onFailure(error) {
      mock(error);
    }
  }
  return FailRetrySuccessTask;
}
