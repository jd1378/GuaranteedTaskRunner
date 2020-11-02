import { GuaranteedTask } from '../src/index';

export default class LogTask extends GuaranteedTask {
  start(): void {
    console.log(this.args);
  }
}
