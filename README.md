# task-guarantee

guarantees a task (or task chain) to run

## Info

You need at least node **v10** to run this. (better-sqlite3 v7 requirement)

**v5.0.0***: A major change is in how tasks are executed. because it was very easy to forget calling `.exec()` after defining the task chain, I changed it. you can find the details inside examples below.

Since v4.0.0, Project is migrated to typescript. but still lacks the required tests and functionality to work under cluster mode. I may add the support in future. I've tried to keep the API the way it was. but a few breaking changes were introduced. you can check in [CHANGELOG](https://github.com/jd1378/GuaranteedTaskRunner/blob/master/CHANGELOG.md)

Currently there's no support for limiting how many tasks can be run at the same time, but I may add support in future.

## Purpose

I needed something to do a chain of defined tasks as quickly as possible with being able to:

* restart the task on failure
* stop executing task if a global condition is not met (e.g. internet)
* continue executing task when condition is met
* save current unfinished tasks to disk when stopped and continue execution when program is restarted
* chain tasks and continue the chain execution when stops and starts again
* pass results of a task to the next task in the chain

## How this package does this

The idea is to make your tasks as small as possible to make it possible to save the args to database to be able to recreate and execute them later. currently `better-sqlite3` is used for db stuff.

You create a class that extends the `GuaranteedTask` class provided by this package, then Create an instance of `TaskRunner` with definition of your classes along with other options.

Then you only tell TaskRunner when you need to run a task and it runs the task. Normally it should only run a task once if successful, however it is possible that the task run more than once , it should be rare though.

The conditions where it may run more than once, those that come to my mind are:

* when theres a power failure
* when condition changes, it takes as long as `conditionCheckRate` of `TaskRunner` to take effect (to stop executing tasks), meanwhile any task that runs during this time may fail (should fail*)

`* you can make a task fail by throwing an Error inside start() function of your task, it will be cought in TaskRunner to determine failure`

I've tried to handle shutdowns gracefully with stopping the runner and closing the db (using `node-cleanup`). still, there may be problems (specially on windows).

## Current limitations

* The database that `TaskRunner` uses is created in current working directory of the process, inside `data` folder. TaskRunner creates a single database with default name of 'TaskRunner.sqlite3'. You can change this per Runner using `options.dbOptions.name` when instantiating `TaskRunner`. All of the tasks are saved inside one table inside the database for chaining.
* It is your responsibility to make sure the args is simple and possible to stringify with `JSON.stringify()`, otherwise you will run into unknown errors.

## usage

```bash
npm i task-guarantee
# or
yarn add task-guarantee
```

then

```js
// This is an example only.
// Only to show how the runner works.

const {
  GuaranteedTask,
  TaskRunner
} = require('task-guarantee');

class SendMailTask extends GuaranteedTask {

  async start() {
    this.sendMail(this.args);
  }

  sendMail(args) {
    console.log(args);
  }
}

const taskRunner = new TaskRunner({ Tasks: [SendMailTask] });
taskRunner.start(); // don't forget to start the task runner
taskRunner.execute(SendMailTask, { to: 'example@example.com', subject: 'ehmm', text: 'nothing' });
// should log the args
// you can also stop and close the db if you don't want to do anything anymore
taskRunner.stop();
taskRunner.db.close();
```

Also it is possible to pass reference of your object to use in your tasks. I *guess* like this :

```js
const {
  GuaranteedTask,
  TaskRunner
} = require('task-guarantee');
const MailService = require('./mail.service');

const mservice = new MailService();

class SendMailTask extends GuaranteedTask {

  async start() {
    // this.dependency = mservice
    await this.dependency.sendMail(this.args);
  }
}

const taskRunner = new TaskRunner({ Tasks: [SendMailTask], dependency: mservice });

taskRunner.start(); // don't forget to start the task runner
taskRunner.execute(SendMailTask, { to: 'example@example.com', subject: 'ehmm', text: 'nothing' });
```

and the task chain:

```js
const {
  GuaranteedTask,
  TaskRunner,
  TaskChain,
} = require('task-guarantee');

class ChainTask extends GuaranteedTask {

  async start() {
    console.log(this.args)
    return this.args + 1;
  }
}

const taskRunner = new TaskRunner({ Task: [ChainTask] });

taskRunner.start();
taskRunner.execute(
  new TaskChain().add(ChainTask, 1).add(ChainTask).add(ChainTask, 5)
  // or new TaskChain(ChainTask, 1)...
);
// Should log :
// 1
// 2
// 5
```

## Notes

After calling `TaskRunner.start()`, the task runner stops and starts the task execution when condition changes internally. but if you call `TaskRunner.stop()`, the execution will stop completely and you need to call `TaskRunner.start()` to continue normally.

Note that in the task chain, tasks only execute if the tasks before it execute successfully. If **Any** of the task in the chain fails, it will not run the rest. ***And If*** one of the tasks in the chain removes itself inside the `onFailure()` of the task, the rest of the chain gets removed from db as well.

## Changelogs

For changelogs checkout [here](https://github.com/jd1378/GuaranteedTaskRunner/blob/master/CHANGELOG.md)

## API

### TaskRunner (options)

```js
options = {
  Tasks, // Array of GuaranteedTask classes thats used by TaskRunner
  dependency,
  runConditions = [], // array of functions that returns or resolves to true or false (global run condition , e.g. internet)
  conditionCheckRate = 10 * 1000, // execute `runConditions` functions every x milliseconds
  taskFailureDelay = 10 * 1000 // restarts the task after x milliseconds after failure
  dbOptions = {
    // sqlite3 options +
    name: 'TaskRunner.sqlite3' // db name
  }
}
```

#### methods

* `start()` - an async function that returns when the task runner is ready to run tasks.
being async is the reason that task runner does not auto start when instantiated.
because you may want to make sure it's ready.
* `stop()` - stops the task runner completely. (doesn't close database)
* `execute(Task, args) => Promise<void>` - add Task to db and execute
* `execute(TaskChain) => Promise<void>` - add TaskChain to db and execute
* `db.close()` - Closes the database connection. never call this unless you really want to get rid of the TaskRunner instance.

### GuaranteedTask

#### props

* `id` - task id in database
* `args` - the arguments passed to the task
* `dependency` - the dependency passed to the task
* `attempt` - current attempt at running the task
* `nextTaskId` - task id of next task in database
* `taskRunner` - the task runner instance that is running this task

#### methods that you can override

gets called - when:

* `start()` - when the task is executed for the **first** time
* `start(true)` - when the task runs for the second time (or more) after failure.
* `onFailure(err, removeTaskChain)` - when task throws an error inside `start()`. does nothing by default.
* `onFinish(execResult)` - when task finishes executing start or restart. does nothing by default. this method is for extra fancy work but there's no guarantee on this one. task runner does not await this and does not catch it's errors. please make sure you don't throw any errors in here.
  