import { GuaranteedTask } from '../src/index';

export default function NormalTaskClass(
  mock: (args: unknown) => void,
): typeof GuaranteedTask {
  class NormalTask extends GuaranteedTask {
    start() {
      mock(this.args);
    }
  }
  return NormalTask;
}
