import assert from "node:assert/strict";
import test from "node:test";
import { MatchBand, bandWidth, matchBand } from "../src/index.js";

function player(id, rating, joinedAt, extra = {}) {
  return { id, rating, joinedAt, ...extra };
}

function idsOf(result) {
  return {
    pairs: result.pairs.map((pair) => pair.map((entry) => entry.id)),
    waiting: result.waiting.map((entry) => entry.id),
  };
}

function assertPartition(players, result) {
  const seen = new Set();
  for (const pair of result.pairs) {
    assert.equal(pair.length, 2);
    for (const entry of pair) {
      assert.equal(seen.has(entry.id), false);
      seen.add(entry.id);
    }
  }
  for (const entry of result.waiting) {
    assert.equal(seen.has(entry.id), false);
    seen.add(entry.id);
  }
  assert.deepEqual([...seen].sort(), players.map((entry) => entry.id).sort());
}

test("pairs players inside the starting band", () => {
  const options = { startWidth: 40, growthPerSecond: 0, cap: 40 };
  const players = [
    player("near", 1510, 500, { note: "kept" }),
    player("anchor", 1500, 0),
    player("far", 1800, 100),
  ];
  const result = matchBand(players, 1_000, options);

  assert.deepEqual(idsOf(result), {
    pairs: [["anchor", "near"]],
    waiting: ["far"],
  });
  assert.equal(result.pairs[0][0], players[1]);
  assert.equal(result.pairs[0][1], players[0]);
  assert.equal(result.pairs[0][1].note, "kept");
  assert.equal(result.waiting[0], players[2]);
  assertPartition(players, result);

  const edge = { startWidth: 25, growthPerSecond: 0, cap: 25 };
  assert.deepEqual(
    idsOf(matchBand([player("a", 0, 0), player("b", 25, 1)], 0, edge)).pairs,
    [["a", "b"]],
  );
  assert.deepEqual(
    idsOf(matchBand([player("a", 0, 0), player("b", 26, 1)], 0, edge)).pairs,
    [],
  );

  const negatives = [player("a", -50, 0), player("b", -40, 1)];
  assert.deepEqual(
    idsOf(
      matchBand(negatives, 0, { startWidth: 10, growthPerSecond: 0, cap: 10 }),
    ).pairs,
    [["a", "b"]],
  );

  const equalOnly = { startWidth: 0, growthPerSecond: 0, cap: 0 };
  assert.deepEqual(
    idsOf(
      matchBand(
        [player("a", 5, 0), player("b", 5, 1), player("c", 6, 2)],
        0,
        equalOnly,
      ),
    ),
    { pairs: [["a", "b"]], waiting: ["c"] },
  );
});

test("widens the band over wait time", () => {
  const options = { startWidth: 0, growthPerSecond: 5, cap: 500 };
  const players = [player("a", 1000, 0), player("b", 1050, 0)];

  assert.equal(bandWidth(0, 0, options), 0);
  assert.deepEqual(idsOf(matchBand(players, 0, options)).pairs, []);

  assert.equal(bandWidth(0, 9_000, options), 45);
  assert.deepEqual(idsOf(matchBand(players, 9_000, options)).pairs, []);

  assert.equal(bandWidth(0, 10_000, options), 50);
  assert.deepEqual(idsOf(matchBand(players, 10_000, options)).pairs, [
    ["a", "b"],
  ]);

  const mutual = { startWidth: 10, growthPerSecond: 1, cap: 100 };
  const staggered = [player("early", 1000, 0), player("late", 1030, 10_000)];
  assert.equal(bandWidth(0, 10_000, mutual), 20);
  assert.equal(bandWidth(10_000, 10_000, mutual), 10);
  assert.deepEqual(idsOf(matchBand(staggered, 10_000, mutual)).pairs, []);

  assert.equal(bandWidth(0, 29_000, mutual), 39);
  assert.equal(bandWidth(10_000, 29_000, mutual), 29);
  assert.deepEqual(idsOf(matchBand(staggered, 29_000, mutual)).pairs, []);

  assert.equal(bandWidth(0, 30_000, mutual), 40);
  assert.equal(bandWidth(10_000, 30_000, mutual), 30);
  assert.deepEqual(idsOf(matchBand(staggered, 30_000, mutual)).pairs, [
    ["early", "late"],
  ]);

  assert.equal(
    bandWidth(-5_000, 0, { startWidth: 0, growthPerSecond: 2, cap: 100 }),
    10,
  );
  assert.equal(
    bandWidth(10_000, 0, { startWidth: 12, growthPerSecond: 5, cap: 40 }),
    12,
  );
  assert.equal(
    bandWidth(0, 2_000, { startWidth: 0, growthPerSecond: 0.5, cap: 10 }),
    1,
  );
});

test("stops widening at the cap", () => {
  const options = { startWidth: 10, growthPerSecond: 5, cap: 40 };
  assert.equal(bandWidth(0, 0, options), 10);
  assert.equal(bandWidth(0, 5_000, options), 35);
  assert.equal(bandWidth(0, 6_000, options), 40);
  assert.equal(bandWidth(0, 7_000, options), 40);
  assert.equal(bandWidth(0, 10_000_000, options), 40);

  const atCap = [player("a", 1000, 0), player("b", 1040, 0)];
  const overCap = [player("a", 1000, 0), player("b", 1041, 0)];
  const now = 10_000_000;
  assert.deepEqual(idsOf(matchBand(atCap, now, options)).pairs, [["a", "b"]]);
  assert.deepEqual(idsOf(matchBand(overCap, now, options)), {
    pairs: [],
    waiting: ["a", "b"],
  });

  const wider = { startWidth: 10, growthPerSecond: 5, cap: 41 };
  assert.deepEqual(idsOf(matchBand(overCap, now, wider)).pairs, [["a", "b"]]);

  const frozen = { startWidth: 15, growthPerSecond: 0, cap: 15 };
  assert.equal(bandWidth(0, 999_000, frozen), 15);
  assert.deepEqual(
    idsOf(matchBand([player("a", 0, 0), player("b", 16, 0)], 999_000, frozen))
      .pairs,
    [],
  );
});

test("matches each player at most once", () => {
  const options = { startWidth: 100, growthPerSecond: 0, cap: 100 };
  const trio = [
    player("a", 1000, 0),
    player("b", 1000, 1),
    player("c", 1000, 2),
  ];
  const trioResult = matchBand(trio, 0, options);
  assert.deepEqual(idsOf(trioResult), {
    pairs: [["a", "b"]],
    waiting: ["c"],
  });
  assertPartition(trio, trioResult);

  const crowd = Array.from({ length: 10 }, (_, index) =>
    player(`p${index}`, 1500, index),
  );
  const crowdResult = matchBand(crowd, 0, options);
  assert.deepEqual(idsOf(crowdResult), {
    pairs: [
      ["p0", "p1"],
      ["p2", "p3"],
      ["p4", "p5"],
      ["p6", "p7"],
      ["p8", "p9"],
    ],
    waiting: [],
  });
  assertPartition(crowd, crowdResult);

  const groups = [
    player("d", 2020, 30),
    player("b", 1010, 20),
    player("a", 1000, 10),
    player("c", 2000, 15),
  ];
  const grouped = matchBand(groups, 0, {
    startWidth: 30,
    growthPerSecond: 0,
    cap: 30,
  });
  assert.deepEqual(idsOf(grouped), {
    pairs: [
      ["a", "b"],
      ["c", "d"],
    ],
    waiting: [],
  });
  assertPartition(groups, grouped);
});

test("breaks ties by earlier join time and then id", () => {
  const options = { startWidth: 100, growthPerSecond: 0, cap: 100 };
  const byJoin = [
    player("seeker", 1000, 0),
    player("later", 1100, 5),
    player("earlier", 900, 4),
  ];
  assert.deepEqual(idsOf(matchBand(byJoin, 0, options)), {
    pairs: [["seeker", "earlier"]],
    waiting: ["later"],
  });

  const byId = [
    player("a2", 1100, 5),
    player("seeker", 1000, 0),
    player("a10", 900, 5),
  ];
  const tied = matchBand(byId, 0, options);
  assert.deepEqual(idsOf(tied), {
    pairs: [["seeker", "a10"]],
    waiting: ["a2"],
  });
  assert.deepEqual(
    idsOf(matchBand([...byId].reverse(), 0, options)),
    idsOf(tied),
  );

  const closest = [
    player("seeker", 1000, 0),
    player("early-far", 1090, 1),
    player("late-near", 1010, 2),
  ];
  assert.deepEqual(idsOf(matchBand(closest, 0, options)).pairs, [
    ["seeker", "late-near"],
  ]);
});

test("rejects invalid input", () => {
  const options = { startWidth: 10, growthPerSecond: 1, cap: 30 };
  const valid = [player("a", 100, 0)];
  const invalidCalls = [
    () => matchBand(null, 0, options),
    () => matchBand({}, 0, options),
    () => matchBand("a", 0, options),
    () => matchBand(valid, Number.NaN, options),
    () => matchBand(valid, Number.POSITIVE_INFINITY, options),
    () => matchBand(valid, "0", options),
    () => matchBand(valid, 0, null),
    () => matchBand(valid, 0, []),
    () => matchBand(valid, 0, {}),
    () =>
      matchBand(valid, 0, {
        startWidth: Number.NaN,
        growthPerSecond: 0,
        cap: 1,
      }),
    () =>
      matchBand(valid, 0, {
        startWidth: Number.POSITIVE_INFINITY,
        growthPerSecond: 0,
        cap: 1,
      }),
    () =>
      matchBand(valid, 0, {
        startWidth: -0.1,
        growthPerSecond: 0,
        cap: 1,
      }),
    () =>
      matchBand(valid, 0, {
        startWidth: 1,
        growthPerSecond: -1,
        cap: 1,
      }),
    () =>
      matchBand(valid, 0, {
        startWidth: 5,
        growthPerSecond: 0,
        cap: 4,
      }),
    () =>
      matchBand(valid, 0, {
        startWidth: 1,
        growthPerSecond: 0,
        cap: Number.POSITIVE_INFINITY,
      }),
    () => matchBand([null], 0, options),
    () => matchBand([1], 0, options),
    () => matchBand([[]], 0, options),
    () => matchBand([{ rating: 1, joinedAt: 0 }], 0, options),
    () => matchBand([{ id: "", rating: 1, joinedAt: 0 }], 0, options),
    () => matchBand([{ id: 1, rating: 1, joinedAt: 0 }], 0, options),
    () => matchBand([{ id: "a", rating: Number.NaN, joinedAt: 0 }], 0, options),
    () =>
      matchBand(
        [{ id: "a", rating: Number.POSITIVE_INFINITY, joinedAt: 0 }],
        0,
        options,
      ),
    () => matchBand([{ id: "a", rating: "1", joinedAt: 0 }], 0, options),
    () => matchBand([{ id: "a", joinedAt: 0 }], 0, options),
    () => matchBand([{ id: "a", rating: 1, joinedAt: Number.NaN }], 0, options),
    () =>
      matchBand(
        [{ id: "a", rating: 1, joinedAt: Number.NEGATIVE_INFINITY }],
        0,
        options,
      ),
    () => matchBand([{ id: "a", rating: 1 }], 0, options),
    () => matchBand([player("a", 1, 0), player("a", 2, 1)], 0, options),
    () => bandWidth(Number.NaN, 0, options),
    () => bandWidth(0, Number.NEGATIVE_INFINITY, options),
    () => bandWidth("0", 0, options),
    () => new MatchBand(null),
    () => new MatchBand({ startWidth: 1, growthPerSecond: 1, cap: 0 }),
  ];

  for (const call of invalidCalls) {
    assert.throws(call, TypeError);
  }

  const sparse = [];
  sparse[1] = player("a", 1, 0);
  assert.throws(() => matchBand(sparse, 0, options), {
    name: "TypeError",
    message: /players\[0\]/,
  });
  assert.throws(
    () => matchBand([player("a", 1, 0), player("a", 1, 1)], 0, options),
    { name: "TypeError", message: /duplicate player id a/ },
  );
  assert.throws(
    () =>
      matchBand(valid, 0, {
        startWidth: 5,
        growthPerSecond: 0,
        cap: 4,
      }),
    { name: "TypeError", message: /cap/ },
  );
  assert.throws(
    () =>
      matchBand(valid, 0, {
        startWidth: -1,
        growthPerSecond: 0,
        cap: 0,
      }),
    { name: "TypeError", message: /startWidth/ },
  );
});

test("keeps calls pure and agrees with MatchBand", () => {
  const options = { startWidth: 50, growthPerSecond: 2, cap: 80, label: "x" };
  const players = [
    player("c", 1100, 3),
    player("a", 1000, 1),
    player("b", 1040, 2),
    player("d", 1600, 4),
  ];
  const before = structuredClone(players);
  const order = players.map((entry) => entry.id);
  const now = 5_000;

  const first = matchBand(players, now, options);
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(idsOf(matchBand(players, now, options)), idsOf(first));
  }

  assert.deepEqual(players, before);
  assert.deepEqual(
    players.map((entry) => entry.id),
    order,
  );
  assertPartition(players, first);

  const queue = new MatchBand(options);
  options.startWidth = 0;
  options.growthPerSecond = 0;
  options.cap = 0;
  assert.equal(queue.bandWidth(1, now), bandWidth(1, now, beforeOptions()));
  assert.deepEqual(
    queue.match(players, now),
    matchBand(players, now, beforeOptions()),
  );

  const narrow = new MatchBand({ startWidth: 5, growthPerSecond: 0, cap: 5 });
  const wide = new MatchBand({
    startWidth: 100,
    growthPerSecond: 0,
    cap: 100,
  });
  const apart = [player("a", 0, 0), player("b", 50, 0)];
  assert.deepEqual(idsOf(narrow.match(apart, 0)).pairs, []);
  assert.deepEqual(idsOf(wide.match(apart, 0)).pairs, [["a", "b"]]);

  assert.deepEqual(matchBand([], 0, beforeOptions()), {
    pairs: [],
    waiting: [],
  });
  const solo = [player("solo", 10, 5)];
  const soloResult = matchBand(solo, 5, beforeOptions());
  assert.deepEqual(soloResult.pairs, []);
  assert.equal(soloResult.waiting[0], solo[0]);

  const unmatched = [
    player("b", 0, 20),
    player("c", 100, 10),
    player("a", 50, 10),
  ];
  assert.deepEqual(
    idsOf(
      matchBand(unmatched, 100, {
        startWidth: 0,
        growthPerSecond: 0,
        cap: 0,
      }),
    ).waiting,
    ["a", "c", "b"],
  );
});

function beforeOptions() {
  return { startWidth: 50, growthPerSecond: 2, cap: 80 };
}
