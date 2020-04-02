const fs = require('fs');
const path = require('path');

function deleteFolderRecursive(pathArg) {
  let files = [];
  if (fs.existsSync(pathArg)) {
    files = fs.readdirSync(pathArg);
    files.forEach((file) => {
      const curPath = path.join(pathArg, file);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(pathArg);
  }
}

function getDataFolderPath() {
  return path.join(process.cwd(), 'data');
}

function deleteData() {
  return deleteFolderRecursive(getDataFolderPath());
}

function waitForNextTick() {
  return new Promise((resolve) => {
    process.nextTick(() => resolve());
  });
}

function doLoop() {
  return new Promise((resolve) => {
    setImmediate(() => resolve());
  });
}

async function waitForNextLoop(count = 1) {
  for (let i = 0; i < count; i++) {
    // the wait loop is intentional
    // eslint-disable-next-line no-await-in-loop
    await doLoop();
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  deleteData, waitForNextLoop, deleteFolderRecursive, getDataFolderPath, waitForNextTick, wait,
};
