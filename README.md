# task-guarantee

guarantees a task to run

## Warning

this is experimental. use at your own risk. the test coverage is not complete

## Purpose

I needed something to do a defined task as quickly as possible with being able to:

* restart the task on failure
* stop executing task if a global condition is not met (e.g. internet)
* continue executing task when condition is met
* save current unfinished tasks to disk when stopped and continue execution when program is restarted

## How this package does this

First of all, the time to execute the idea was limited, so suggestions are welcome.

The idea is to make your tasks as small as possible to make it possible to save the args to database to be able to recreate and execute them later. currently `better-sqlite3` is used for db stuff.

You create a class that extends the `GuaranteedTask` class provided by this package, then Create an instance of `TaskRunner` with definition of your class as constructor argument, along with other options.

Then you only tell TaskRunner when you need to run a task and it runs the task. Normally it should only run A task once, however it is possible that the task run more than once , it should be rare though.

The conditions where it may run more than once, those that come to my mind are:

* when theres a power failure
* when condition changes, it takes as long as `conditionCheckRate` of `TaskRunner` to take effect (to stop executing tasks), meanwhile any task that runs during this time may fail (should fail*)

`* you can make a task fail by throwing an Error inside start() function of your task, it will be cought in TaskRunner to determine failure`

I've tried to handle shutdowns gracefully with stopping the runner and closing the db (using `node-cleanup`). still, there may be problems.

## Current limitations

* The database that `TaskRunner` uses is created in current working directory of the process, inside `data` folder. The file name is based on the name of your Task class. so you should never run the same program twice (you can't cluster). The reason is you should never instantiate the `TaskRunner` with same Task class more than once because the database it uses will have the same name and can cause conflict.
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
    await this.sendMail(this.args);
  }

  sendMail() {
    console.log(this.args);
  }
}

const taskRunner = new TaskRunner({ Task: SendMailTask });
taskRunner.start(); // don't forget to start the task runner
taskRunner.addTask({ to: 'example@example.com', subject: 'ehmm', text: 'nothing' });
// should log the args
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

const taskRunner = new TaskRunner({ Task: SendMailTask, dependency: mservice });

taskRunner.start(); // don't forget to start the task runner
taskRunner.addTask({ to: 'example@example.com', subject: 'ehmm', text: 'nothing' });
```

## Notes

After calling `start()`, the task runner stops and starts the task execution when condition changes internally. but if you call `stop()`, the execution will stop completely and you need to call `start()` to continue normally.

## API

### TaskRunner (options)

```js
options = {
  Task, // your extended GuaranteedTask class
  dependency = null,
  runConditions = [], // array of functions that returns or resolves to true or false (global run condition , e.g. internet)
  conditionCheckRate = 10 * 1000, // execute `runConditions` functions every x milliseconds
  taskFailureDelay = 10 * 1000 // restarts the task after x milliseconds after failure
}
```

#### methods

* `start()` - an async function that returns when the task runner is ready to run tasks.
being async is the reason that task runner does not auto start when instantiated.
because you may want to make sure it's ready.
* `stop()` - stops the task runner completely.
* `closeDb()` - if you are done with the runner, make sure to close the db
* `addTask(args)` - use this for adding task and running it as soon as possible.

### GuaranteedTask

#### props

* `id` - task id in database
* `args` - the arguments passed to the task
* `dependency` - the dependency passed to the task

#### methods that you can override

* `start` - when the task is executed for the **first** time
* `restart` - when the task runs for the second time (or more) after failure. defaults to execute start if not overriden.
* `onFailure` - when task throws an error inside start or restart. does nothing by default.
* `onFinish` - when task finishes executing start or restart. does nothing by default.
  