import { GuaranteedTask } from '../src/index';

// adds 1 to the arg and returns it

export default function ChainTaskClass(
  mock: (args: unknown) => void,
): typeof GuaranteedTask {
  class ChainTask extends GuaranteedTask {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    start(_retrying: boolean) {
      mock(this.args);
      if (typeof this.args === 'number') {
        if (this.args <= 3) {
          return this.args + 1;
        }
      }
      throw new Error('fail!');
    }

    onFailure(_error, removeTaskChain: () => void) {
      removeTaskChain();
    }
  }
  return ChainTask;
}
