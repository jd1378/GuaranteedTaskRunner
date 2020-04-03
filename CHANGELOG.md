# Changelog

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
