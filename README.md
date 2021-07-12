# The Overseer (Backend)

This repository contains the source for @TheOverseer, the analytics bot at Hack Club.

The Overseer is split into

- The Backend (This) -- A script that runs on the hour and computes Analytics
- [The Frontend](https://github.com/khrj/the-overseer-frontend) -- Listeners for the bot's slash commands and channel-join events

## Running

To compute analytics manually, run 

```bash
yarn start
```

This produces
  - `20.json` - A sorted array containing the top 20 most active members, names-only
  - `results.json` - A sorted array containing all the members, sorted by how active they are. IDs-only
  
Example contents of `20.json`:

```jsonc
[
  ["USERNAME1", 500]
  ["USERNAME2", 250],
  ["USERNAME3", 50],
  // ...
]
```

Example contents of `results.json`:

```jsonc
[
  ["USERID1", 500]
  ["USERID2", 250],
  ["USERID3", 50],
  // ...
]
```
