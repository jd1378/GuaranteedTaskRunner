// for running this you should first run `yarn build` to generate js files to `dist` folder.

/* eslint-disable */
const path = require('path');
const fs = require('fs');
const { GuaranteedTask, TaskRunner } = require('../dist/index');

function getDataFolderPath() {
  return path.join(process.cwd(), 'data');
}

function deleteFolderRecursive(pathArg) {
  let files = [];
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

function deleteData() {
  return deleteFolderRecursive(getDataFolderPath());
}

deleteData();

class DoLogTask extends GuaranteedTask {
  async start() {
    this.doLog(this.args);
  }

  doLog(args) {
    // eslint-disable-next-line no-console
    console.log(args);
  }
}

async function runExample() {
  const taskRunner = new TaskRunner({ Tasks: [DoLogTask] });
  await taskRunner.start();
  taskRunner.add(DoLogTask, 'tadan').exec();
  await taskRunner.stop();
  taskRunner.db.close();
}

runExample();
