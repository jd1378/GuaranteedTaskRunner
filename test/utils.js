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

module.exports = {
  deleteData, deleteFolderRecursive, getDataFolderPath, waitForNextTick,
};
