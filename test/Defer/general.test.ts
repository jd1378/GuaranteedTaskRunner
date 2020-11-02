/* eslint-disable max-classes-per-file */
import { wait } from '../utils';
import Deferred from '../../src/Deffered';

const mock = jest.fn();

describe('Deferred', () => {
  it('Blocks async execution till resolved', async () => {
    const defer = new Deferred();
    const deferPromise = (async () => {
      await defer;
      mock('yes');
    })();

    expect(mock).toHaveBeenCalledTimes(0);
    await wait(300);
    defer.resolve();
    await deferPromise;
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith('yes');
  });
});
