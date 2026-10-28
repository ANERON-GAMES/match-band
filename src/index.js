function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function normalizeOptions(options) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new TypeError("options must be an object");
  }

  const { startWidth, growthPerSecond, cap } = options;
  assertFiniteNumber(startWidth, "startWidth");
  assertFiniteNumber(growthPerSecond, "growthPerSecond");
  assertFiniteNumber(cap, "cap");

  if (startWidth < 0) {
    throw new TypeError("startWidth must be greater than or equal to 0");
  }
  if (growthPerSecond < 0) {
    throw new TypeError("growthPerSecond must be greater than or equal to 0");
  }
  if (cap < startWidth) {
    throw new TypeError("cap must be greater than or equal to startWidth");
  }

  return { startWidth, growthPerSecond, cap };
}

function assertPlayer(player, index) {
  const label = `players[${index}]`;
  if (player === null || typeof player !== "object" || Array.isArray(player)) {
    throw new TypeError(`${label} must be an object`);
  }
  if (typeof player.id !== "string" || player.id.length === 0) {
    throw new TypeError(`${label}.id must be a non-empty string`);
  }
  assertFiniteNumber(player.rating, `${label}.rating`);
  assertFiniteNumber(player.joinedAt, `${label}.joinedAt`);
}

function assertPlayers(players) {
  if (!Array.isArray(players)) {
    throw new TypeError("players must be an array");
  }

  const seen = new Set();
  for (let index = 0; index < players.length; index += 1) {
    if (!Object.hasOwn(players, index)) {
      throw new TypeError(`players[${index}] is missing`);
    }
    const player = players[index];
    assertPlayer(player, index);
    if (seen.has(player.id)) {
      throw new TypeError(`duplicate player id ${player.id}`);
    }
    seen.add(player.id);
  }
}

function comparePlayers(left, right) {
  if (left.joinedAt < right.joinedAt) {
    return -1;
  }
  if (left.joinedAt > right.joinedAt) {
    return 1;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function widthFor(joinedAt, now, options) {
  const elapsed = now - joinedAt;
  const waitSeconds = elapsed > 0 ? elapsed / 1000 : 0;
  const grown = options.startWidth + options.growthPerSecond * waitSeconds;
  return grown < options.cap ? grown : options.cap;
}

function takePartner(current, candidate) {
  if (current === null) {
    return true;
  }
  if (candidate.gap !== current.gap) {
    return candidate.gap < current.gap;
  }
  return comparePlayers(candidate.player, current.player) < 0;
}

export function bandWidth(joinedAt, now, options) {
  const normalized = normalizeOptions(options);
  assertFiniteNumber(joinedAt, "joinedAt");
  assertFiniteNumber(now, "now");
  return widthFor(joinedAt, now, normalized);
}

export function matchBand(players, now, options) {
  const normalized = normalizeOptions(options);
  assertFiniteNumber(now, "now");
  assertPlayers(players);

  const ordered = players.slice().sort(comparePlayers);
  const used = new Set();
  const pairs = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const seeker = ordered[index];
    if (used.has(seeker.id)) {
      continue;
    }

    const seekerWidth = widthFor(seeker.joinedAt, now, normalized);
    let best = null;

    for (
      let partnerIndex = index + 1;
      partnerIndex < ordered.length;
      partnerIndex += 1
    ) {
      const candidate = ordered[partnerIndex];
      if (used.has(candidate.id)) {
        continue;
      }

      const gap = Math.abs(seeker.rating - candidate.rating);
      const candidateWidth = widthFor(candidate.joinedAt, now, normalized);
      if (gap > seekerWidth || gap > candidateWidth) {
        continue;
      }

      const next = { player: candidate, gap };
      if (takePartner(best, next)) {
        best = next;
      }
    }

    if (best !== null) {
      used.add(seeker.id);
      used.add(best.player.id);
      pairs.push([seeker, best.player]);
    }
  }

  pairs.sort(
    (left, right) =>
      comparePlayers(left[0], right[0]) || comparePlayers(left[1], right[1]),
  );

  const waiting = ordered.filter((player) => !used.has(player.id));
  return { pairs, waiting };
}

export class MatchBand {
  #options;

  constructor(options) {
    this.#options = normalizeOptions(options);
  }

  bandWidth(joinedAt, now) {
    assertFiniteNumber(joinedAt, "joinedAt");
    assertFiniteNumber(now, "now");
    return widthFor(joinedAt, now, this.#options);
  }

  match(players, now) {
    return matchBand(players, now, this.#options);
  }
}
