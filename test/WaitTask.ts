import { GuaranteedTask } from '../src/index';
import { wait } from './utils';

function WaitTaskClass(mock: (args: unknown) => void): typeof GuaranteedTask {
  class WaitTask extends GuaranteedTask {
    async start() {
      await wait(this.args as number);
      mock('ran');
    }
  }
  return WaitTask;
}

export default WaitTaskClass;
