# task-guarantee

guarantees a task (or task chain) to run

## Warning

this is experimental. use at your own risk. the test coverage is not complete

## Purpose

I needed something to do a chain of defined tasks as quickly as possible with being able to:

* restart the task on failure
* stop executing task if a global condition is not met (e.g. internet)
* continue executing task when condition is met
* save current unfinished tasks to disk when stopped and continue execution when program is restarted
* chain tasks and continue the chain execution when stops and starts again
* pass results of a task to the next task in the chain

## How this package does this

First of all, the time to execute the idea was limited, so suggestions are welcome.

The idea is to make your tasks as small as possible to make it possible to save the args to database to be able to recreate and execute them later. currently `better-sqlite3` is used for db stuff.

You create a class that extends the `GuaranteedTask` class provided by this package, then Create an instance of `TaskRunner` with definition of your classes along with other options.

Then you only tell TaskRunner when you need to run a task and it runs the task. Normally it should only run a task once if successful, however it is possible that the task run more than once , it should be rare though.

The conditions where it may run more than once, those that come to my mind are:

* when theres a power failure
* when condition changes, it takes as long as `conditionCheckRate` of `TaskRunner` to take effect (to stop executing tasks), meanwhile any task that runs during this time may fail (should fail*)

`* you can make a task fail by throwing an Error inside start() function of your task, it will be cought in TaskRunner to determine failure`

I've tried to handle shutdowns gracefully with stopping the runner and closing the db (using `node-cleanup`). still, there may be problems.

## Current limitations

* ~~The database that `TaskRunner` uses is created in current working directory of the process, inside `data` folder. The file name is based on the name of your Task class. so you should never run the same program twice (you can't cluster). The reason is you should never instantiate the `TaskRunner` with same Task class more than once because the database it uses will have the same name and can cause conflict.~~ It now creates a single database with default name of 'TaskRunner.sqlite3'. You can change this per Runner. All of the tasks are saved inside one table inside the database for chaining.
* Make sure the args is simple and possible to stringify with `JSON.stringify()`
* Due to buggy behaviour of javascript's timeout function, do not use delays above ~ 800-900 seconds (Do if you are sure what you are doing).

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
taskRunner.add(SendMailTask, { to: 'example@example.com', subject: 'ehmm', text: 'nothing' }).exec(); // IMPORTANT: if you don't call exec it will do nothing
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
taskRunner.add({ to: 'example@example.com', subject: 'ehmm', text: 'nothing' }).exec();
```

and the task chain:

```js
const {
  GuaranteedTask,
  TaskRunner
} = require('task-guarantee');

class ChainTask extends GuaranteedTask {

  async start() {
    console.log(this.args)
    return this.args + 1;
  }
}

const taskRunner = new TaskRunner({ Task: [ChainTask] });

taskRunner.start();
taskRunner.add(ChainTask, 1).then(ChainTask).then(ChainTask, 5).exec();
// Should log :
// 1
// 2
// 5
```

## Notes

After calling `start()`, the task runner stops and starts the task execution when condition changes internally. but if you call `stop()`, the execution will stop completely and you need to call `start()` to continue normally.

IMPORTANT: always call `exec()` after adding your tasks or it will do nothing.

Note that tasks added using `then()` will only execute if the tasks before it execute successfully. If **Any** of the task in the chain fails, it will not run the rest. ***And If*** one of the tasks in the chain removes it self inside the `onFailure()` of the task, the rest of the chain gets removed from db as well.

## API

### TaskRunner (options)

```js
options = {
  Tasks, // Array of GuaranteedTask classes thats used by TaskRunner
  dependency = null,
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
* `stop()` - stops the task runner completely.
* `closeDb()` - if you are done with the runner, make sure to close the db
* `add(Task, args) => { then(Task, [args]) , exec() }` - add Task first, then call exec() at the end to finalize it

### GuaranteedTask

#### props

* `id` - task id in database
* `args` - the arguments passed to the task
* `dependency` - the dependency passed to the task
* `attempt` - current attempt at running the task
* `nextTaskId`

#### methods that you can override

* `start` - when the task is executed for the **first** time
* `restart` - when the task runs for the second time (or more) after failure. defaults to execute start if not overriden.
* `onFailure` - when task throws an error inside start or restart. does nothing by default.
* `onFinish` - when task finishes executing start or restart. does nothing by default. this method is for extra fancy work but there's no guarantee on this one.
  