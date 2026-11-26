import { HallId, RackDefinition } from './types';

export interface RackSearchResult {
  rawQuery: string;
  normalizedQuery: string;
  isActive: boolean;
  allMatches: RackDefinition[];
  allMatchedIds: Set<string>;
  activeHallMatches: RackDefinition[];
  activeHallMatchIds: Set<string>;
  matchCountByHall: Record<HallId, number>;
  exactMatch: RackDefinition | null;
  firstMatch: RackDefinition | null;
}

function compactRackToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Matches racks by rack ID (e.g. "B-R05-12", "b-r05", "R05-12", "BR0512") and
 * aggregates match counts per data hall for map highlighting and cross-hall jump.
 */
export function searchRacksById(
  racks: RackDefinition[],
  rawQuery: string,
  activeHallId: HallId
): RackSearchResult {
  const normalizedQuery = rawQuery.trim().toUpperCase();
  const compactQuery = compactRackToken(normalizedQuery);
  const matchCountByHall: Record<HallId, number> = {
    'hall-a': 0,
    'hall-b': 0,
    'hall-c': 0,
    'hall-d': 0,
  };

  if (!normalizedQuery || !compactQuery) {
    return {
      rawQuery,
      normalizedQuery: '',
      isActive: false,
      allMatches: [],
      allMatchedIds: new Set(),
      activeHallMatches: [],
      activeHallMatchIds: new Set(),
      matchCountByHall,
      exactMatch: null,
      firstMatch: null,
    };
  }

  const scored: Array<{ rack: RackDefinition; score: number }> = [];
  let exactMatch: RackDefinition | null = null;

  for (const rack of racks) {
    const idUpper = rack.id.toUpperCase();
    const idCompact = compactRackToken(idUpper);
    const isExact = idUpper === normalizedQuery || idCompact === compactQuery;
    const isDirectMatch = idUpper.includes(normalizedQuery);
    const isCompactMatch = idCompact.includes(compactQuery);

    if (!isDirectMatch && !isCompactMatch) continue;

    if (isExact && !exactMatch) {
      exactMatch = rack;
    }

    matchCountByHall[rack.hallId] = (matchCountByHall[rack.hallId] ?? 0) + 1;

    // Lower score = higher priority: exact > prefix in active hall > prefix > substring in active hall > substring
    const inActiveHall = rack.hallId === activeHallId ? 0 : 1;
    const isPrefix = idUpper.startsWith(normalizedQuery) || idCompact.startsWith(compactQuery);
    const score = isExact ? 0 : (isPrefix ? 10 : 20) + inActiveHall;
    scored.push({ rack, score });
  }

  scored.sort((a, b) => a.score - b.score || a.rack.id.localeCompare(b.rack.id));

  const allMatches = scored.map((entry) => entry.rack);
  const allMatchedIds = new Set(allMatches.map((r) => r.id));
  const activeHallMatches = allMatches.filter((r) => r.hallId === activeHallId);
  const activeHallMatchIds = new Set(activeHallMatches.map((r) => r.id));

  return {
    rawQuery,
    normalizedQuery,
    isActive: true,
    allMatches,
    allMatchedIds,
    activeHallMatches,
    activeHallMatchIds,
    matchCountByHall,
    exactMatch,
    firstMatch: exactMatch ?? activeHallMatches[0] ?? allMatches[0] ?? null,
  };
}
