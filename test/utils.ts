import fs from 'fs';
import path from 'path';

function getDataFolderPath(): string {
  return path.join(process.cwd(), 'data');
}

function deleteFolderRecursive(pathArg: string): void {
  let files: string[] = [];
  if (fs.existsSync(pathArg)) {
    files = fs.readdirSync(pathArg);
    files.forEach((file) => {
      const curPath = path.join(pathArg, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(pathArg);
  }
}

function deleteData(): void {
  return deleteFolderRecursive(getDataFolderPath());
}

function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve());
  });
}

function doLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => resolve());
  });
}

async function waitForNextLoop(count = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    // the wait loop is intentional
    // eslint-disable-next-line no-await-in-loop
    await doLoop();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for given time then call the "callback" function and then returns
 */
async function waitDo(
  ms: number,
  callback: () => void | Promise<void>,
): Promise<void> {
  await wait(ms);
  await callback();
}

export {
  deleteData,
  waitForNextLoop,
  deleteFolderRecursive,
  getDataFolderPath,
  waitForNextTick,
  wait,
  waitDo,
};
