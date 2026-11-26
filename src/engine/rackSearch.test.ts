import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_RACKS } from './seedData';
import { searchRacksById } from './rackSearch';

test('searchRacksById returns inactive empty result for blank queries', () => {
  const res = searchRacksById(INITIAL_RACKS, '   ', 'hall-b');
  assert.equal(res.isActive, false);
  assert.equal(res.allMatches.length, 0);
  assert.equal(res.activeHallMatches.length, 0);
  assert.equal(res.exactMatch, null);
  assert.equal(res.firstMatch, null);
});

test('searchRacksById matches partial row IDs in the active hall accurately', () => {
  const res = searchRacksById(INITIAL_RACKS, 'b-r05', 'hall-b');
  assert.equal(res.isActive, true);
  assert.equal(res.allMatches.length, 20);
  assert.equal(res.activeHallMatches.length, 20);
  assert.equal(res.matchCountByHall['hall-b'], 20);
  assert.equal(res.matchCountByHall['hall-a'], 0);
  assert.equal(res.exactMatch, null);
  assert.equal(res.firstMatch?.id, 'B-R05-01');
  assert.ok(res.activeHallMatchIds.has('B-R05-12'));
});

test('searchRacksById detects exact match and supports compact queries without hyphens', () => {
  const exact = searchRacksById(INITIAL_RACKS, 'A-R12-08', 'hall-b');
  assert.equal(exact.isActive, true);
  assert.equal(exact.allMatches.length, 1);
  assert.equal(exact.exactMatch?.id, 'A-R12-08');
  assert.equal(exact.exactMatch?.hallId, 'hall-a');
  assert.equal(exact.activeHallMatches.length, 0);
  assert.equal(exact.matchCountByHall['hall-a'], 1);
  assert.equal(exact.firstMatch?.id, 'A-R12-08');

  const compact = searchRacksById(INITIAL_RACKS, 'br0101', 'hall-b');
  assert.equal(compact.exactMatch?.id, 'B-R01-01');
  assert.equal(compact.allMatches.length, 1);
});

test('searchRacksById aggregates cross-hall matches and prioritizes active hall first', () => {
  const res = searchRacksById(INITIAL_RACKS, 'R05-10', 'hall-c');
  assert.equal(res.allMatches.length, 4);
  assert.equal(res.matchCountByHall['hall-a'], 1);
  assert.equal(res.matchCountByHall['hall-b'], 1);
  assert.equal(res.matchCountByHall['hall-c'], 1);
  assert.equal(res.matchCountByHall['hall-d'], 1);
  assert.equal(res.firstMatch?.id, 'C-R05-10');
});

test('searchRacksById handles non-matching queries gracefully', () => {
  const res = searchRacksById(INITIAL_RACKS, 'Z-R99-99', 'hall-b');
  assert.equal(res.isActive, true);
  assert.equal(res.allMatches.length, 0);
  assert.equal(res.activeHallMatches.length, 0);
  assert.equal(res.exactMatch, null);
  assert.equal(res.firstMatch, null);
});
