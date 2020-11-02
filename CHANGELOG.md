# Changelog

## 4.0.0

- Changed project to typescript
- there was a bug that would prevent restart() from being called on continues execution of tasks.
  In v4 there won't be a restart method anymore in GuaranteedTask,
  Instead It's replaced with a boolean argument given to `start(retyring: boolean)` when attempt > 0
- updated better-sqlite3 to v7
- need at least node v10

## 3.1.3

- Important fix: Task delay on failure was not respected. it's now fixed

## 3.1.2

- a bit better readme

## 3.1.1

- added jsdocs for `onFailure()`

## 3.1.0

Features:

- TaskRunner instance is now also passed to the running tasks, so you can now add tasks during onFailure and normal operation. You can access the runner instance using `this.taskRunner` inside your tasks.
- added corresponding test

## 3.0.0

the reason behind breaking change is that error is more common as first arg, so i made this a breaking change by putting it there.

Breaking Change:

- `onFailure(removeTask: function)` method is changed to `onFailure(error: Error, removeTask: function)`

Features:

- result of the task execution is now also passed to onFinish
- added more tests

Usability Fix:

- theres no need to return a boolean to decide if task was removed or not inside `onFailure()`, prior to this you had to return true if the task was removing it self and false if not.

## 2.0.3

- type hint `.then()`'s first arg as `GuaranteedTask`

## 2.0.2

- small type hint fix and added related error

## 2.0.1

- resend the termination signal received after cleaning up
- fixed related test

## 2.0.0 (LOTS of breaking changes)

There's a lot of breaking changes, make sure you read the docs again carefully.

I highly recommend upgrading to this version.

All the tasks are saved inside a single db now.

Features:

- Added task chain
- option to choose a db name
- use multiple tasks with a single runner

Fixed:

- some bugs related to stopping and starting the runner
- wrong deconstructing usage
- jest tests not being able to run in memory and in parallel
- jest tests being messy (It's now a bit less messy)

## 1.0.0

- initial release
