import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHIFT_PATTERN_LIST,
  SHIFT_TEAMS,
  buildShiftCycleCalendar,
  computeEffectiveDutyStatus,
  computeTeamCycleStats,
  createInitialProfiles,
  createInitialShiftState,
  createOperatorProfile,
  executeShiftHandover,
  exportShiftRosterToCsv,
  getActiveShiftSnapshot,
  isValidAvatarUrl,
  switchShiftPattern,
  updateProfileAvatar,
  validateNewProfileDraft,
  verifyPattern24x7Coverage,
} from './shiftEngine';

test('initial operator profiles provide 8 DCO staff per site (24 total) covering all 4 shift teams (A-D) and all 3 KL sites', () => {
  const profiles = createInitialProfiles();
  assert.equal(profiles.length, 24);

  const teams = new Set(profiles.map((p) => p.shiftTeam));
  for (const team of SHIFT_TEAMS) {
    assert.ok(teams.has(team), `Missing ${team}`);
    assert.ok(
      profiles.some((p) => p.shiftTeam === team && p.isShiftLead),
      `Missing shift lead for ${team}`
    );
  }
  for (const siteId of ['kl1', 'kl2', 'kl3'] as const) {
    const siteStaff = profiles.filter((p) => p.primarySite === siteId);
    assert.equal(siteStaff.length, 8, `Expected 8 DCO staff on ${siteId}, got ${siteStaff.length}`);
    for (const team of SHIFT_TEAMS) {
      const teamOnSite = siteStaff.filter((p) => p.shiftTeam === team);
      assert.equal(
        teamOnSite.length,
        2,
        `Expected 2 DCO staff for ${team} on ${siteId}, got ${teamOnSite.length}`
      );
    }
  }
});

test('all 3 shift cycle patterns guarantee 100% 24/7 coverage with zero double-booked slots', () => {
  for (const pattern of SHIFT_PATTERN_LIST) {
    const audit = verifyPattern24x7Coverage(pattern.id);
    assert.equal(audit.coveragePct, 100, `${pattern.id} must have 100% 24/7 coverage`);
    assert.equal(audit.uncoveredSlots, 0, `${pattern.id} must have zero uncovered slots`);
    assert.equal(audit.doubleBookedDays, 0, `${pattern.id} must have zero double-booked days`);

    const stats = computeTeamCycleStats(pattern.id);
    for (const team of SHIFT_TEAMS) {
      assert.ok(stats[team].avgWeeklyHours >= 40 && stats[team].avgWeeklyHours <= 44);
    }
  }
});

test('executeShiftHandover advances active slot/day, updates on-duty team, and appends handover log', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  const profiles = createInitialProfiles();
  let state = createInitialShiftState(now);
  const initialSnap = getActiveShiftSnapshot(state);
  assert.equal(initialSnap.activeSlot.slot, 'Day');
  assert.equal(initialSnap.onDutyTeam, 'Shift A');
  assert.equal(initialSnap.nextSlot.slot, 'Night');
  assert.equal(initialSnap.nextTeam, 'Shift C');

  const res1 = executeShiftHandover({
    state,
    profiles,
    activeOperator: profiles[0],
    siteId: 'kl1',
    openCriticalCount: 1,
    openWarningCount: 2,
    sitePue: 1.32,
    slaCompliancePct: 100,
    notes: 'Handover to Night Watch Shift C verified.',
    checklistVerified: true,
    now: now + 1000,
  });

  state = res1.nextState;
  assert.equal(res1.incomingLead?.name, 'Aisha Rahman');
  assert.equal(state.handoverLog[0].incomingTeam, 'Shift C');
  assert.equal(state.handoverLog[0].outgoingOperatorName, 'Elena Vance');

  const afterNightSnap = getActiveShiftSnapshot(state);
  assert.equal(afterNightSnap.activeSlot.slot, 'Night');
  assert.equal(afterNightSnap.onDutyTeam, 'Shift C');
  assert.equal(computeEffectiveDutyStatus(profiles[4], state), 'On Duty'); // Aisha Rahman (Shift C)
  assert.equal(computeEffectiveDutyStatus(profiles[0], state), 'Standby'); // Elena Vance (next Day on Day 2)

  // Advance from Night (Day 1) to Day (Day 2)
  const res2 = executeShiftHandover({
    state,
    profiles,
    activeOperator: profiles[4],
    siteId: 'kl1',
    openCriticalCount: 0,
    openWarningCount: 1,
    sitePue: 1.31,
    slaCompliancePct: 100,
    notes: 'Morning handoff back to Day Watch.',
    checklistVerified: true,
    now: now + 2000,
  });
  const day2Snap = getActiveShiftSnapshot(res2.nextState);
  assert.equal(day2Snap.cycleDayNumber, 2);
  assert.equal(day2Snap.activeSlot.slot, 'Day');
});

test('switching shift cycle patterns updates active slots and calendar smoothly', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  const state = createInitialShiftState(now);
  const continental = switchShiftPattern(state, 'continental-8h');
  const snap = getActiveShiftSnapshot(continental);
  assert.equal(snap.pattern.slots.length, 3);
  assert.equal(snap.activeSlot.slot, 'Morning');

  const cal = buildShiftCycleCalendar('continental-8h', 0, state.baseDateIso, 14);
  assert.equal(cal.length, 14);
  assert.equal(cal[0].isCurrentCycleDay, true);
  assert.equal(cal[0].assignments['Shift A'], 'Morning');
});

test('validateNewProfileDraft enforces required fields and exportShiftRosterToCsv outputs valid CSV', () => {
  assert.ok(
    validateNewProfileDraft({
      name: '',
      role: 'NOC Operations Engineer',
      shiftTeam: 'Shift A',
      primarySite: 'kl1',
      email: 'bad-email',
      phone: '',
      certificationsText: '',
      isShiftLead: false,
    }) !== null
  );

  const validDraft = {
    name: 'Siti Aminah',
    role: 'NOC Operations Engineer' as const,
    shiftTeam: 'Shift B' as const,
    primarySite: 'kl2' as const,
    email: 'siti.aminah@orise-dc.io',
    phone: '+60 3-8312-4299',
    certificationsText: 'CDCP, ASHRAE A1',
    isShiftLead: false,
  };
  assert.equal(validateNewProfileDraft(validDraft), null);
  const created = createOperatorProfile(validDraft, 1795172000000);
  assert.equal(created.initials, 'SA');
  assert.deepEqual(created.certifications, ['CDCP', 'ASHRAE A1']);

  const csv = exportShiftRosterToCsv(createInitialShiftState(1795172000000), [
    ...createInitialProfiles(),
    created,
  ]);
  assert.ok(csv.startsWith('\uFEFF# Orise DCIM'));
  assert.ok(csv.includes('Siti Aminah'));
  assert.ok(csv.includes('Shift Cycle'));
});

test('all 24 DCO staff profiles have unique valid local avatar portraits and updateProfileAvatar validates inputs', () => {
  const profiles = createInitialProfiles();
  assert.equal(profiles.length, 24);

  const uniqueUrls = new Set<string>();
  for (const op of profiles) {
    assert.ok(op.avatarUrl, `Missing avatarUrl for ${op.name} (${op.id})`);
    assert.ok(
      isValidAvatarUrl(op.avatarUrl),
      `Invalid avatarUrl for ${op.name}: ${op.avatarUrl}`
    );
    assert.ok(
      op.avatarUrl.startsWith('/src/assets/images/'),
      `Expected local asset path for ${op.name}`
    );
    uniqueUrls.add(op.avatarUrl);
  }
  assert.equal(uniqueUrls.size, 24, 'Every DCO staff member must have a unique portrait image');

  // Validate URL safety checks
  const validDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert.equal(isValidAvatarUrl(validDataUrl), true);
  assert.equal(isValidAvatarUrl('https://cdn.example.com/staff.jpg'), true);
  assert.equal(isValidAvatarUrl('javascript:alert(1)'), false);
  assert.equal(isValidAvatarUrl('http://insecure.example.com/a.jpg'), false);
  assert.equal(isValidAvatarUrl(''), false);

  // Immutably update and clear profile avatar
  const updated = updateProfileAvatar(profiles, 'op-daniel', validDataUrl);
  assert.equal(updated.find((p) => p.id === 'op-daniel')?.avatarUrl, validDataUrl);
  assert.notEqual(profiles.find((p) => p.id === 'op-daniel')?.avatarUrl, validDataUrl);

  // Reject unsafe URL without modifying list
  const unchanged = updateProfileAvatar(profiles, 'op-daniel', 'javascript:alert(1)');
  assert.strictEqual(unchanged, profiles);

  // Clear avatar to undefined
  const cleared = updateProfileAvatar(updated, 'op-daniel', undefined);
  assert.equal(cleared.find((p) => p.id === 'op-daniel')?.avatarUrl, undefined);

  // New operator creation preserves valid avatarUrl
  const createdWithAvatar = createOperatorProfile(
    {
      name: 'Irfan Hakim',
      role: 'NOC Operations Engineer',
      shiftTeam: 'Shift A',
      primarySite: 'kl1',
      email: 'irfan.hakim@orise-dc.io',
      phone: '+60 3-8312-4901',
      certificationsText: 'CDCP',
      isShiftLead: false,
      avatarUrl: validDataUrl,
    },
    1795430100000
  );
  assert.equal(createdWithAvatar.avatarUrl, validDataUrl);
});
