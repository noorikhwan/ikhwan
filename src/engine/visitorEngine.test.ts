import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialProfiles } from './shiftEngine';
import {
  checkInVisitor,
  checkOutVisitor,
  computeVisitorStats,
  createInitialVisitors,
  exportVisitorsCsv,
  filterVisitors,
  registerVisitor,
  revokeVisitorAccess,
  updateVisitorCompliance,
  validateVisitorDraft,
} from './visitorEngine';

const FIXED_NOW = Date.UTC(2026, 10, 21, 8, 30, 0);

test('validateVisitorDraft rejects missing required fields and accepts complete visitor registrations', () => {
  const invalid = validateVisitorDraft({
    siteId: 'kl1',
    fullName: '',
    company: 'V',
    email: '',
    phone: '',
    idNumber: '12',
    visitorType: 'Vendor / OEM Engineer',
    purpose: 'Fix',
    accessZones: [],
    escortProfileId: '',
    escortName: '',
    escortRequired: true,
    vehiclePlate: '',
    parkingBay: 'None',
    equipmentManifest: '',
    ndaSigned: false,
    safetyBriefed: false,
    biometricVerified: false,
    durationHours: 4,
  });

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.company);
  assert.ok(invalid.errors.idNumber);
  assert.ok(invalid.errors.purpose);
  assert.ok(invalid.errors.accessZones);
  assert.ok(invalid.errors.escortProfileId);

  const valid = validateVisitorDraft({
    siteId: 'kl1',
    fullName: 'Ahmad Faizal',
    company: 'Vertiv Malaysia',
    email: 'faizal@vertiv.my',
    phone: '+60 12-555 8120',
    idNumber: 'MY-900514-14-5123',
    visitorType: 'Vendor / OEM Engineer',
    purpose: 'Quarterly preventive inspection of Rooftop Chiller CHA-A7',
    accessZones: ['Rooftop Chiller Plant'],
    escortProfileId: 'op-elena',
    escortName: 'Elena Vance',
    escortRequired: true,
    vehiclePlate: 'WXY 8421',
    parkingBay: 'VP-04',
    equipmentManifest: 'Manifold gauge set, clamp meter',
    ndaSigned: true,
    safetyBriefed: false,
    biometricVerified: false,
    durationHours: 4,
  });

  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('registerVisitor, compliance gate enforcement, RFID badge check-in, and check-out workflow', () => {
  const profiles = createInitialProfiles();
  const initial = createInitialVisitors(profiles, FIXED_NOW);

  const created = registerVisitor(
    initial,
    {
      siteId: 'kl1',
      fullName: 'Ahmad Faizal',
      company: 'Vertiv Malaysia',
      email: 'faizal@vertiv.my',
      phone: '+60 12-555 8120',
      idNumber: 'MY-900514-14-5123',
      visitorType: 'Vendor / OEM Engineer',
      purpose: 'Quarterly preventive inspection of Rooftop Chiller CHA-A7',
      accessZones: ['Rooftop Chiller Plant'],
      escortProfileId: profiles[0].id,
      escortName: profiles[0].name,
      escortRequired: true,
      vehiclePlate: 'wxy 8421',
      parkingBay: 'VP-04',
      equipmentManifest: 'Manifold gauge set',
      ndaSigned: true,
      safetyBriefed: false,
      biometricVerified: false,
      durationHours: 3,
    },
    profiles[0].name,
    FIXED_NOW
  );

  assert.match(created.id, /^VIS-KL1-\d{4}$/);
  assert.equal(created.status, 'Pre-Approved');
  assert.equal(created.vehiclePlate, 'WXY 8421');
  assert.equal(created.badgeNumber, null);

  let list = [created, ...initial];

  // Check-in must be blocked when Safety & Biometric checks are incomplete
  const blocked = checkInVisitor(list, created.id, profiles[0].name, FIXED_NOW + 60_000);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error ?? '', /Safety & ESD Briefing/);
  assert.match(blocked.error ?? '', /ID \/ Biometric Verification/);

  // Complete compliance checks then check in -> RFID badge issued
  list = updateVisitorCompliance(
    list,
    created.id,
    { safetyBriefed: true, biometricVerified: true },
    profiles[0].name,
    FIXED_NOW + 90_000
  );
  const checkedIn = checkInVisitor(list, created.id, profiles[0].name, FIXED_NOW + 120_000);
  assert.equal(checkedIn.ok, true);
  assert.match(checkedIn.badgeNumber ?? '', /^KL1-TMP-\d{3}$/);

  const activeRec = checkedIn.visitors.find((v) => v.id === created.id)!;
  assert.equal(activeRec.status, 'Checked In');
  assert.equal(activeRec.badgeNumber, checkedIn.badgeNumber);
  assert.equal(activeRec.checkedInAt, FIXED_NOW + 120_000);

  // Check out -> badge returned and status updated
  const afterOut = checkOutVisitor(
    checkedIn.visitors,
    created.id,
    profiles[0].name,
    FIXED_NOW + 3_600_000,
    'Work completed cleanly'
  );
  const outRec = afterOut.find((v) => v.id === created.id)!;
  assert.equal(outRec.status, 'Checked Out');
  assert.equal(outRec.checkedOutAt, FIXED_NOW + 3_600_000);
  assert.ok(outRec.auditLog.some((e) => e.action.includes('returned and deactivated')));
});

test('revokeVisitorAccess, computeVisitorStats, filterVisitors, and exportVisitorsCsv work accurately', () => {
  const profiles = createInitialProfiles();
  const initial = createInitialVisitors(profiles, FIXED_NOW);

  const kl1Stats = computeVisitorStats(initial, 'kl1', FIXED_NOW);
  assert.equal(kl1Stats.onSiteCount, 2);
  assert.equal(kl1Stats.preApprovedCount, 1);
  assert.equal(kl1Stats.checkedOutCount, 1);
  assert.equal(kl1Stats.activeParkingBays, 2);

  const revoked = revokeVisitorAccess(
    initial,
    'VIS-KL1-2043',
    'Rescheduled audit window',
    profiles[0].name,
    FIXED_NOW + 5000
  );
  const revRec = revoked.find((v) => v.id === 'VIS-KL1-2043')!;
  assert.equal(revRec.status, 'Denied / Revoked');
  assert.ok(revRec.auditLog.some((e) => e.action.includes('Rescheduled audit window')));

  const filtered = filterVisitors(revoked, {
    siteScope: 'kl1',
    status: 'Checked In',
    visitorType: 'all',
    search: 'schneider',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'VIS-KL1-2041');

  const csv = exportVisitorsCsv(filtered);
  assert.ok(csv.startsWith('Visitor ID,Site,Full Name,Company'));
  assert.ok(csv.includes('VIS-KL1-2041'));
  assert.ok(csv.includes('KL1-TMP-101'));
});
