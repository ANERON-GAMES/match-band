# @aneron/match-band

Pure JavaScript skill-band matchmaking. Players wait with a rating and a join time. The accepted rating gap grows with wait time, up to a cap. Pairing is a pure function of the waiting list, the options, and a time you pass in.

## Purpose

Match players who are close enough in rating without freezing the allowed gap. Someone who just joined searches a narrow band. Someone who has waited longer searches a wider band, until the configured cap. The result is the pairs that can be matched at a given moment, and the players who are still waiting.

The module does not read a clock, start timers, or draw random numbers. Callers own the waiting list and pass the current time on each call.

## Install

```bash
npm install @aneron/match-band
```

The package is ESM and runs on Node.js 20 and 22. It has no runtime dependencies.

## Usage

```js
import { matchBand } from "@aneron/match-band";

const options = {
  startWidth: 50,
  growthPerSecond: 2,
  cap: 200,
};

const players = [
  { id: "p1", rating: 1500, joinedAt: 0 },
  { id: "p2", rating: 1560, joinedAt: 0 },
  { id: "p3", rating: 1900, joinedAt: 0 },
];

const { pairs, waiting } = matchBand(players, 10_000, options);
```

`joinedAt` and the time argument are milliseconds. At 10 seconds of wait the width is `min(200, 50 + 2 * 10) = 70`, so `p1` and `p2` pair (gap 60) and `p3` stays waiting.

The same options can be reused through a small class:

```js
import { MatchBand } from "@aneron/match-band";

const queue = new MatchBand(options);
queue.bandWidth(0, 10_000);
queue.match(players, 10_000);
```

## API

### `matchBand(players, now, options)`

Returns `{ pairs, waiting }`.

- `players` is an array of player objects. Each player must have `id` (non-empty string, case-sensitive), `rating` (finite number), and `joinedAt` (finite number, milliseconds). Extra fields are left untouched and are still present on the returned objects.
- `now` is a finite number, milliseconds, on the same scale as `joinedAt`.
- `options.startWidth` is the rating radius at join time. Finite number `>= 0`.
- `options.growthPerSecond` is how many rating points the radius gains per second of wait. Finite number `>= 0`. Fractional seconds count.
- `options.cap` is the maximum radius. Finite number `>= startWidth`.

`pairs` is an array of two-player arrays. `waiting` is an array of the players who were not paired. Player objects are the same references that were passed in. The input array is not reordered or mutated.

Both arrays are ordered by `joinedAt` ascending, then by `id` ascending (UTF-16 lexicographic order). Inside a pair, the earlier player is first.

Throws `TypeError` when `players`, a player, `now`, or `options` is invalid, including duplicate ids, a sparse `players` array, a negative width or growth value, or a cap below `startWidth`.

### `bandWidth(joinedAt, now, options)`

Returns the rating radius for one join time at `now`, using the same formula as pairing. Throws `TypeError` on invalid numbers or options.

### `new MatchBand(options)`

Checks `options` once and keeps that normalized copy. Later edits to the object you passed in are ignored.

### `queue.match(players, now)`

Same result as `matchBand(players, now, options)` for the options given to the constructor.

### `queue.bandWidth(joinedAt, now)`

Same result as `bandWidth(joinedAt, now, options)` for the options given to the constructor.

## Design

Width at time `now`:

```text
waitSeconds = max(0, (now - joinedAt) / 1000)
width = min(cap, startWidth + growthPerSecond * waitSeconds)
```

If `now` is earlier than `joinedAt`, the wait is treated as zero and the width is `startWidth`.

Two players can form a pair only when the absolute rating gap is less than or equal to both widths. One wide band cannot pull in a player whose own band is still too narrow.

Pairing scans players who have waited longest first (`joinedAt`, then `id`). For each still-unmatched player, the partner is the compatible player with the smallest rating gap. Equal gaps go to the earlier `joinedAt`, then to the smaller `id`. Both players are then removed from further pairing, so a player appears in at most one pair. The scan is greedy and quadratic in the number of waiting players. It is deterministic: the same players, options, and time always produce the same pairs.

There is no internal waiting list. Pass the full set of players who are still eligible each time you want a result.

## License

MIT. Copyright (c) 2026 Vadim Gubin.
