# Orise DCIM — Firestore Security Specification

## 1. Access Control Model
- **Default Deny**: All unmatched paths are explicitly denied (`allow read, write: if false`).
- **Authentication & Verification**: All operational writes require `request.auth != null && request.auth.token.email_verified == true`.
- **Admin Bootstrap**:
  - Primary verified admin: `request.auth.token.email == 'noorikhwan@gmail.com' && request.auth.token.email_verified == true`.
  - Delegated admins: Existence of `/admins/$(request.auth.uid)` (used on single-doc `get`/`write` checks; never called inside `list` queries).
- **Path Variable Hardening**: Single-doc operations (`get`, `create`, `update`, `delete`) validate document IDs via `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
- **Ownership & Multi-Workstation Sync**:
  - Every operational document stores immutable `ownerUid == request.auth.uid`.
  - Collection `list` queries strictly check `resource.data.ownerUid == request.auth.uid || isBootstrapAdmin()`.

## 2. Collection Rules Matrix
| Collection | Get | List | Create | Update | Delete |
|---|---|---|---|---|---|
| `users/{userId}` | Owner or Admin | Admin claim | Owner (`role == 'operator'` or Bootstrap Admin) | Owner (`ownerUid`/`createdAt`/`role` immutable) or Admin | Admin |
| `admins/{userId}` | Owner or Admin | Admin claim | Admin | Admin | Admin |
| `noc_tickets/{ticketId}` | Owner or Admin | Owner or Admin claim | Verified Owner | Owner (`ownerUid`/`ticketId`/`createdAt` immutable) or Admin | Owner or Admin |
| `shift_handovers/{handoverId}` | Owner or Admin | Owner or Admin claim | Verified Owner | Owner (`ownerUid`/`createdAt` immutable) or Admin | Owner or Admin |
| `maintenance_windows/{windowId}` | Owner or Admin | Owner or Admin claim | Verified Owner (`endAtMs > startAtMs`) | Owner (`ownerUid`/`createdAt` immutable) or Admin | Owner or Admin |
| `audit_events/{eventId}` | Owner or Admin | Owner or Admin claim | Verified Owner | **DENIED (Immutable)** | **DENIED (Immutable)** |
| `hall_power_policies/{policyId}` | Owner or Admin | Owner or Admin claim | Verified Owner (75–115%, 0.05–1.5 kW) | Owner (`ownerUid`/`siteId`/`hallId`/`createdAt` immutable) or Admin | Owner or Admin |
| `hall_thermal_policies/{policyId}` | Owner or Admin | Owner or Admin claim | Verified Owner (50–80°C warn, 55–90°C crit, crit > warn, 0.5–5.0°C hyst) | Owner (`ownerUid`/`siteId`/`hallId`/`createdAt` immutable) or Admin | Owner or Admin |
| `alert_states/{stateId}` | Owner or Admin | Owner or Admin claim | Verified Owner | Owner (`ownerUid`/`siteId`/`alertId`/`createdAt` immutable) or Admin | Owner or Admin |
| `custom_alert_rules/{ruleId}` | Owner or Admin | Owner or Admin claim | Verified Owner | Owner (`ownerUid`/`siteId`/`ruleId`/`createdAt` immutable) or Admin | Owner or Admin |
| `site_visitors/{visitorDocId}` | Owner or Admin | Owner or Admin claim | Verified Owner | Owner (`ownerUid`/`visitorId`/`siteId`/`createdAt` immutable) or Admin | Owner or Admin |
| `incident_runbooks/{runbookId}` | Owner or Admin | Owner or Admin claim | Verified Owner | Owner (`ownerUid`/`runbookId`/`alertId`/`siteId`/`createdAt` immutable) or Admin | Owner or Admin |

## 3. Dirty Dozen Adversarial Payloads (Red Team Verification)
1. **Shadow Field Injection**: Adding `isAdmin: true` or `ghost: 1` to any write -> REJECTED by `hasOnly(...)`.
2. **Identity Spoofing**: Setting `ownerUid` to another user's UID on create -> REJECTED by `incoming().ownerUid == request.auth.uid`.
3. **Unverified Admin Email Spoof**: Matching admin email with `email_verified == false` -> REJECTED by `email_verified == true`.
4. **Role Self-Escalation**: Creating `/users/{uid}` with `role: 'admin'` as non-bootstrap user -> REJECTED.
5. **Audit Tampering**: Updating or deleting `/audit_events/{id}` -> REJECTED (`allow update, delete: if false`).
6. **Client Timestamp Forgery**: Sending past/future `createdAt` or `updatedAt` instead of `serverTimestamp()` -> REJECTED (`== request.time`).
7. **ID Poisoning**: Sending a 500-char or slash/space document ID -> REJECTED by `isValidId(id)`.
8. **Payload Bloat / Denial of Wallet**: Sending a 50KB `notes` or `title` string -> REJECTED by `.size()` bounds.
9. **Out-of-Bounds Policy**: Sending `thresholdPct: 999` or `completedSteps > totalSteps` -> REJECTED by numeric range checks.
10. **Cross-Tenant List Scraping**: Querying `alert_states` without `where('ownerUid', '==', uid)` -> REJECTED by `allow list`.
11. **PII Cross-Read**: Non-owner calling `get` on `/users/{otherUid}` -> REJECTED by `isOwner(userId) || isAdmin()`.
12. **Immutable Key Rewrite**: Changing `ownerUid`, `alertId`, or `createdAt` on update -> REJECTED by immutability guards + `affectedKeys().hasOnly(...)`.
