# task-guarantee

guarantees a task to run

## Warning

this is experimental. use at your own risk.

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
  constructor(options) {
    super(options);
    const { args } = options;
    this.args = args;
  }

  async start() {
    await this.sendMail(args);
  }

  sendMail(args) {
    console.log(JSON.stringify(args));
  }
}

const taskRunner = new TaskRunner({ Task: SendMailTask });
taskRunner.start();
taskRunner.addTask({ to: 'example@example.com', subject: 'ehmm', text: 'nothing' });
// should log the args
```

Also it is possible to pass reference of your object to use in your tasks. I guess (really) like this :

```js
const {
  GuaranteedTask,
  TaskRunner
} = require('task-guarantee');
const MailService = require('./mail.service');

const mservice = new MailService();

class SendMailTask extends GuaranteedTask {
  constructor(options) {
    super(options);
    const { args } = options;
    this.args = args;
  }

  async start() {
    // this.dependency = mservice
    await this.dependency.sendMail(args);
  }
}

const taskRunner = new TaskRunner({ Task: SendMailTask, dependency: mservice });

taskRunner.start();
taskRunner.addTask({ to: 'example@example.com', subject: 'ehmm', text: 'nothing' });
```
