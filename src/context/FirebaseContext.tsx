import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { SiteId } from '../engine/sites';
import { AlertState, ComparisonOp, HallId, HallPowerCapacityPolicy, HallThermalPolicy, Severity } from '../engine/types';

function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `doc_${Date.now().toString(36)}`;
}

export interface CloudShiftHandoverRecord {
  id: string;
  ownerUid: string;
  siteId: SiteId;
  shiftLabel: string;
  operatorName: string;
  summary: string;
  openCriticalCount: number;
  openTicketsCount: number;
  activeVisitorsCount: number;
  signedOff: boolean;
  createdAtMs: number;
}

export interface CloudMaintenanceWindowRecord {
  id: string;
  ownerUid: string;
  siteId: SiteId;
  title: string;
  scopeType: 'all' | 'hall' | 'rack' | 'subsystem';
  scopeValue: string;
  reason: string;
  createdBy: string;
  status: 'active' | 'scheduled' | 'ended';
  startAtMs: number;
  endAtMs: number;
}

export interface CloudAuditEventInput {
  auditId: string;
  siteCode: string;
  actor: string;
  category: string;
  action: string;
  target: string;
  hash: string;
  prevHash: string;
}

export interface CloudTicketInput {
  ticketId: string;
  siteId: SiteId;
  title: string;
  priority: 'P1 - Critical' | 'P2 - High' | 'P3 - Medium' | 'P4 - Low';
  status: 'Open' | 'In Progress' | 'Pending Parts' | 'Resolved' | 'Closed';
  assetLabel: string;
  assigneeName: string;
}

export interface CloudHallPowerPolicyRecord extends HallPowerCapacityPolicy {
  id: string;
  ownerUid: string;
  siteId: SiteId;
  updatedBy: string;
  updatedAtMs: number;
}

export interface CloudHallThermalPolicyRecord extends HallThermalPolicy {
  id: string;
  ownerUid: string;
  siteId: SiteId;
  updatedBy: string;
  updatedAtMs: number;
}

export interface CloudAlertStateRecord {
  id: string;
  ownerUid: string;
  siteId: SiteId;
  alertId: string;
  state: AlertState;
  actorName: string;
  updatedAtMs: number;
}

export interface CloudCustomAlertRuleRecord {
  id: string;
  ownerUid: string;
  siteId: SiteId;
  ruleId: string;
  name: string;
  metric: string;
  operator: ComparisonOp;
  threshold: number;
  severity: Severity;
  scopeHall: HallId | 'all';
  enabled: boolean;
  updatedAtMs: number;
}

export interface CloudSiteVisitorRecord {
  id: string;
  ownerUid: string;
  visitorId: string;
  siteId: SiteId;
  fullName: string;
  company: string;
  status: 'Pre-Registered' | 'Checked In' | 'Checked Out' | 'Revoked';
  escortName: string;
  badgeNumber: string;
  updatedAtMs: number;
}

export interface CloudIncidentRunbookRecord {
  id: string;
  ownerUid: string;
  runbookId: string;
  alertId: string;
  siteId: SiteId;
  title: string;
  assignedEngineerName: string;
  completedSteps: number;
  totalSteps: number;
  appendedToHandover: boolean;
  notes: string;
  updatedAtMs: number;
}

export interface CloudSyncBreakdown {
  handovers: number;
  maintenanceWindows: number;
  hallPolicies: number;
  hallThermalPolicies: number;
  tickets: number;
  alertStates: number;
  customRules: number;
  visitors: number;
  runbooks: number;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  cloudSyncedCount: number;
  cloudSyncBreakdown: CloudSyncBreakdown;
  cloudHandovers: CloudShiftHandoverRecord[];
  cloudMaintenanceWindows: CloudMaintenanceWindowRecord[];
  cloudHallPolicies: CloudHallPowerPolicyRecord[];
  cloudHallThermalPolicies: CloudHallThermalPolicyRecord[];
  cloudAlertStates: CloudAlertStateRecord[];
  cloudCustomRules: CloudCustomAlertRuleRecord[];
  cloudVisitors: CloudSiteVisitorRecord[];
  cloudRunbooks: CloudIncidentRunbookRecord[];
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  saveShiftHandoverCloud: (payload: {
    siteId: SiteId;
    shiftLabel: string;
    operatorName: string;
    summary: string;
    openCriticalCount: number;
    openTicketsCount: number;
    activeVisitorsCount: number;
    signedOff: boolean;
  }) => Promise<boolean>;
  saveMaintenanceWindowCloud: (payload: {
    siteId: SiteId;
    title: string;
    scopeType: 'all' | 'hall' | 'rack' | 'subsystem';
    scopeValue: string;
    reason: string;
    createdBy: string;
    status: 'active' | 'scheduled' | 'ended';
    startAtMs: number;
    endAtMs: number;
  }) => Promise<string | null>;
  endMaintenanceWindowCloud: (windowId: string) => Promise<void>;
  deleteMaintenanceWindowCloud: (windowId: string) => Promise<void>;
  syncTicketCloud: (payload: CloudTicketInput) => Promise<void>;
  syncAuditEventCloud: (payload: CloudAuditEventInput) => Promise<void>;
  saveHallPowerPolicyCloud: (
    siteId: SiteId,
    policy: HallPowerCapacityPolicy,
    updatedBy: string
  ) => Promise<boolean>;
  saveHallThermalPolicyCloud: (
    siteId: SiteId,
    policy: HallThermalPolicy,
    updatedBy: string
  ) => Promise<boolean>;
  syncAlertStateCloud: (payload: {
    siteId: SiteId;
    alertId: string;
    state: AlertState;
    actorName: string;
  }) => Promise<void>;
  syncCustomAlertRuleCloud: (payload: {
    siteId: SiteId;
    ruleId: string;
    name: string;
    metric: string;
    operator: ComparisonOp;
    threshold: number;
    severity: Severity;
    scopeHall: HallId | 'all';
    enabled: boolean;
  }) => Promise<void>;
  deleteCustomAlertRuleCloud: (siteId: SiteId, ruleId: string) => Promise<void>;
  syncVisitorCloud: (payload: {
    visitorId: string;
    siteId: SiteId;
    fullName: string;
    company: string;
    status: 'Pre-Registered' | 'Checked In' | 'Checked Out' | 'Revoked';
    escortName: string;
    badgeNumber: string;
  }) => Promise<void>;
  syncIncidentRunbookCloud: (payload: {
    runbookId: string;
    alertId: string;
    siteId: SiteId;
    title: string;
    assignedEngineerName: string;
    completedSteps: number;
    totalSteps: number;
    appendedToHandover: boolean;
    notes: string;
  }) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudHandovers, setCloudHandovers] = useState<CloudShiftHandoverRecord[]>([]);
  const [cloudMaintenanceWindows, setCloudMaintenanceWindows] = useState<CloudMaintenanceWindowRecord[]>([]);
  const [cloudHallPolicies, setCloudHallPolicies] = useState<CloudHallPowerPolicyRecord[]>([]);
  const [cloudHallThermalPolicies, setCloudHallThermalPolicies] = useState<CloudHallThermalPolicyRecord[]>([]);
  const [cloudTicketsCount, setCloudTicketsCount] = useState<number>(0);
  const [cloudAlertStates, setCloudAlertStates] = useState<CloudAlertStateRecord[]>([]);
  const [cloudCustomRules, setCloudCustomRules] = useState<CloudCustomAlertRuleRecord[]>([]);
  const [cloudVisitors, setCloudVisitors] = useState<CloudSiteVisitorRecord[]>([]);
  const [cloudRunbooks, setCloudRunbooks] = useState<CloudIncidentRunbookRecord[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        const userRef = doc(db, 'users', nextUser.uid);
        void getDoc(userRef)
          .then((snap) => {
            if (!snap.exists()) {
              return setDoc(userRef, {
                ownerUid: nextUser.uid,
                displayName: (nextUser.displayName || 'NOC Operator').slice(0, 100),
                email: (nextUser.email || 'operator@orise-dc.io').slice(0, 200),
                role: 'operator',
                primarySite: 'kl1',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            return undefined;
          })
          .catch((err) => {
            console.warn('Operator profile sync skipped:', err instanceof Error ? err.message : err);
          });
      } else {
        setCloudHandovers([]);
        setCloudMaintenanceWindows([]);
        setCloudHallPolicies([]);
        setCloudHallThermalPolicies([]);
        setCloudTicketsCount(0);
        setCloudAlertStates([]);
        setCloudCustomRules([]);
        setCloudVisitors([]);
        setCloudRunbooks([]);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners scoped strictly to authenticated user's ownerUid
  useEffect(() => {
    if (!authReady || !user) return;

    const handoversQuery = query(
      collection(db, 'shift_handovers'),
      where('ownerUid', '==', user.uid)
    );
    const unsubHandovers = onSnapshot(
      handoversQuery,
      (snap) => {
        const list: CloudShiftHandoverRecord[] = snap.docs
          .map((d) => {
            const data = d.data();
            const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
            return {
              id: d.id,
              ownerUid: String(data.ownerUid ?? user.uid),
              siteId: (data.siteId as SiteId) ?? 'kl1',
              shiftLabel: String(data.shiftLabel ?? 'Shift Watch'),
              operatorName: String(data.operatorName ?? 'Operator'),
              summary: String(data.summary ?? ''),
              openCriticalCount: Number(data.openCriticalCount ?? 0),
              openTicketsCount: Number(data.openTicketsCount ?? 0),
              activeVisitorsCount: Number(data.activeVisitorsCount ?? 0),
              signedOff: Boolean(data.signedOff),
              createdAtMs: ts,
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setCloudHandovers(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'shift_handovers');
      }
    );

    const mwQuery = query(
      collection(db, 'maintenance_windows'),
      where('ownerUid', '==', user.uid)
    );
    const unsubMw = onSnapshot(
      mwQuery,
      (snap) => {
        const list: CloudMaintenanceWindowRecord[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerUid: String(data.ownerUid ?? user.uid),
              siteId: (data.siteId as SiteId) ?? 'kl1',
              title: String(data.title ?? 'Maintenance Window'),
              scopeType: (data.scopeType as CloudMaintenanceWindowRecord['scopeType']) ?? 'hall',
              scopeValue: String(data.scopeValue ?? 'hall-b'),
              reason: String(data.reason ?? ''),
              createdBy: String(data.createdBy ?? 'NOC Operator'),
              status: (data.status as CloudMaintenanceWindowRecord['status']) ?? 'active',
              startAtMs: Number(data.startAtMs ?? Date.now()),
              endAtMs: Number(data.endAtMs ?? Date.now() + 3600000),
            };
          })
          .sort((a, b) => b.startAtMs - a.startAtMs);
        setCloudMaintenanceWindows(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'maintenance_windows');
      }
    );

    const policyQuery = query(
      collection(db, 'hall_power_policies'),
      where('ownerUid', '==', user.uid)
    );
    const unsubPolicies = onSnapshot(
      policyQuery,
      (snap) => {
        const list: CloudHallPowerPolicyRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid ?? user.uid),
            siteId: (data.siteId as SiteId) ?? 'kl1',
            hallId: (data.hallId as HallId) ?? 'hall-a',
            thresholdPct: Number(data.thresholdPct ?? 100),
            hysteresisKw: Number(data.hysteresisKw ?? 0.15),
            enabled: Boolean(data.enabled ?? true),
            updatedBy: String(data.updatedBy ?? 'NOC Operator'),
            updatedAtMs: ts,
          };
        });
        setCloudHallPolicies(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'hall_power_policies');
      }
    );

    const thermalPolicyQuery = query(
      collection(db, 'hall_thermal_policies'),
      where('ownerUid', '==', user.uid)
    );
    const unsubThermalPolicies = onSnapshot(
      thermalPolicyQuery,
      (snap) => {
        const list: CloudHallThermalPolicyRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid ?? user.uid),
            siteId: (data.siteId as SiteId) ?? 'kl1',
            hallId: (data.hallId as HallId) ?? 'hall-a',
            warningTempC: Number(data.warningTempC ?? 65),
            criticalTempC: Number(data.criticalTempC ?? 72),
            hysteresisC: Number(data.hysteresisC ?? 1.5),
            enabled: Boolean(data.enabled ?? true),
            updatedBy: String(data.updatedBy ?? 'NOC Operator'),
            updatedAtMs: ts,
          };
        });
        setCloudHallThermalPolicies(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'hall_thermal_policies');
      }
    );

    const ticketsQuery = query(
      collection(db, 'noc_tickets'),
      where('ownerUid', '==', user.uid)
    );
    const unsubTickets = onSnapshot(
      ticketsQuery,
      (snap) => {
        setCloudTicketsCount(snap.size);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'noc_tickets');
      }
    );

    const alertStatesQuery = query(
      collection(db, 'alert_states'),
      where('ownerUid', '==', user.uid)
    );
    const unsubAlertStates = onSnapshot(
      alertStatesQuery,
      (snap) => {
        const list: CloudAlertStateRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid ?? user.uid),
            siteId: (data.siteId as SiteId) ?? 'kl1',
            alertId: String(data.alertId ?? ''),
            state: (data.state as AlertState) ?? 'acknowledged',
            actorName: String(data.actorName ?? 'NOC Operator'),
            updatedAtMs: ts,
          };
        });
        setCloudAlertStates(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'alert_states');
      }
    );

    const customRulesQuery = query(
      collection(db, 'custom_alert_rules'),
      where('ownerUid', '==', user.uid)
    );
    const unsubCustomRules = onSnapshot(
      customRulesQuery,
      (snap) => {
        const list: CloudCustomAlertRuleRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid ?? user.uid),
            siteId: (data.siteId as SiteId) ?? 'kl1',
            ruleId: String(data.ruleId ?? d.id),
            name: String(data.name ?? 'Custom Rule'),
            metric: String(data.metric ?? 'cpu'),
            operator: (data.operator as ComparisonOp) ?? '>',
            threshold: Number(data.threshold ?? 85),
            severity: (data.severity as Severity) ?? 'warning',
            scopeHall: (data.scopeHall as HallId | 'all') ?? 'all',
            enabled: Boolean(data.enabled ?? true),
            updatedAtMs: ts,
          };
        });
        setCloudCustomRules(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'custom_alert_rules');
      }
    );

    const visitorsQuery = query(
      collection(db, 'site_visitors'),
      where('ownerUid', '==', user.uid)
    );
    const unsubVisitors = onSnapshot(
      visitorsQuery,
      (snap) => {
        const list: CloudSiteVisitorRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid ?? user.uid),
            visitorId: String(data.visitorId ?? d.id),
            siteId: (data.siteId as SiteId) ?? 'kl1',
            fullName: String(data.fullName ?? 'Visitor'),
            company: String(data.company ?? 'Contractor'),
            status: (data.status as CloudSiteVisitorRecord['status']) ?? 'Pre-Registered',
            escortName: String(data.escortName ?? 'Elena Vance'),
            badgeNumber: String(data.badgeNumber ?? ''),
            updatedAtMs: ts,
          };
        });
        setCloudVisitors(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'site_visitors');
      }
    );

    const runbooksQuery = query(
      collection(db, 'incident_runbooks'),
      where('ownerUid', '==', user.uid)
    );
    const unsubRunbooks = onSnapshot(
      runbooksQuery,
      (snap) => {
        const list: CloudIncidentRunbookRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid ?? user.uid),
            runbookId: String(data.runbookId ?? d.id),
            alertId: String(data.alertId ?? ''),
            siteId: (data.siteId as SiteId) ?? 'kl1',
            title: String(data.title ?? 'Incident Runbook'),
            assignedEngineerName: String(data.assignedEngineerName ?? 'NOC Engineer'),
            completedSteps: Number(data.completedSteps ?? 0),
            totalSteps: Number(data.totalSteps ?? 4),
            appendedToHandover: Boolean(data.appendedToHandover),
            notes: String(data.notes ?? ''),
            updatedAtMs: ts,
          };
        });
        setCloudRunbooks(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'incident_runbooks');
      }
    );

    return () => {
      unsubHandovers();
      unsubMw();
      unsubPolicies();
      unsubThermalPolicies();
      unsubTickets();
      unsubAlertStates();
      unsubCustomRules();
      unsubVisitors();
      unsubRunbooks();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg.includes('popup-closed-by-user') ? 'Sign-in popup closed before completion.' : msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const saveShiftHandoverCloud = useCallback(
    async (payload: {
      siteId: SiteId;
      shiftLabel: string;
      operatorName: string;
      summary: string;
      openCriticalCount: number;
      openTicketsCount: number;
      activeVisitorsCount: number;
      signedOff: boolean;
    }): Promise<boolean> => {
      if (!auth.currentUser) return false;
      try {
        await addDoc(collection(db, 'shift_handovers'), {
          ownerUid: auth.currentUser.uid,
          siteId: payload.siteId,
          shiftLabel: payload.shiftLabel.slice(0, 80),
          operatorName: payload.operatorName.slice(0, 100),
          summary: payload.summary.slice(0, 4000),
          openCriticalCount: Math.max(0, Math.round(payload.openCriticalCount)),
          openTicketsCount: Math.max(0, Math.round(payload.openTicketsCount)),
          activeVisitorsCount: Math.max(0, Math.round(payload.activeVisitorsCount)),
          signedOff: Boolean(payload.signedOff),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'shift_handovers');
      }
    },
    []
  );

  const saveMaintenanceWindowCloud = useCallback(
    async (payload: {
      siteId: SiteId;
      title: string;
      scopeType: 'all' | 'hall' | 'rack' | 'subsystem';
      scopeValue: string;
      reason: string;
      createdBy: string;
      status: 'active' | 'scheduled' | 'ended';
      startAtMs: number;
      endAtMs: number;
    }): Promise<string | null> => {
      if (!auth.currentUser) return null;
      try {
        const ref = await addDoc(collection(db, 'maintenance_windows'), {
          ownerUid: auth.currentUser.uid,
          siteId: payload.siteId,
          title: payload.title.slice(0, 160),
          scopeType: payload.scopeType,
          scopeValue: payload.scopeValue.slice(0, 80),
          reason: payload.reason.slice(0, 500),
          createdBy: payload.createdBy.slice(0, 100),
          status: payload.status,
          startAtMs: Math.round(payload.startAtMs),
          endAtMs: Math.max(Math.round(payload.startAtMs) + 60_000, Math.round(payload.endAtMs)),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return ref.id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'maintenance_windows');
      }
    },
    []
  );

  const endMaintenanceWindowCloud = useCallback(async (windowId: string) => {
    if (!auth.currentUser) return;
    const safeId = sanitizeFirestoreId(windowId);
    const path = `maintenance_windows/${safeId}`;
    try {
      await updateDoc(doc(db, 'maintenance_windows', safeId), {
        status: 'ended',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }, []);

  const deleteMaintenanceWindowCloud = useCallback(async (windowId: string) => {
    if (!auth.currentUser) return;
    const safeId = sanitizeFirestoreId(windowId);
    const path = `maintenance_windows/${safeId}`;
    try {
      await deleteDoc(doc(db, 'maintenance_windows', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }, []);

  const syncTicketCloud = useCallback(async (payload: CloudTicketInput) => {
    if (!auth.currentUser) return;
    const safeId = sanitizeFirestoreId(payload.ticketId);
    const path = `noc_tickets/${safeId}`;
    try {
      const ref = doc(db, 'noc_tickets', safeId);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await updateDoc(ref, {
          status: payload.status,
          assigneeName: payload.assigneeName.slice(0, 100),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          ownerUid: auth.currentUser.uid,
          ticketId: payload.ticketId.slice(0, 40),
          siteId: payload.siteId,
          title: payload.title.slice(0, 200),
          priority: payload.priority,
          status: payload.status,
          assetLabel: payload.assetLabel.slice(0, 120),
          assigneeName: payload.assigneeName.slice(0, 100),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const syncAuditEventCloud = useCallback(async (payload: CloudAuditEventInput) => {
    if (!auth.currentUser) return;
    const safeId = sanitizeFirestoreId(payload.auditId);
    const path = `audit_events/${safeId}`;
    try {
      await setDoc(doc(db, 'audit_events', safeId), {
        ownerUid: auth.currentUser.uid,
        auditId: payload.auditId.slice(0, 48),
        siteCode: payload.siteCode,
        actor: payload.actor.slice(0, 100),
        category: payload.category.slice(0, 40),
        action: payload.action.slice(0, 400),
        target: payload.target.slice(0, 120),
        hash: payload.hash.slice(0, 128),
        prevHash: payload.prevHash.slice(0, 128),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }, []);

  const saveHallPowerPolicyCloud = useCallback(
    async (
      siteId: SiteId,
      policy: HallPowerCapacityPolicy,
      updatedBy: string
    ): Promise<boolean> => {
      if (!auth.currentUser) return false;
      const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${siteId}_${policy.hallId}`);
      const path = `hall_power_policies/${docId}`;
      try {
        const ref = doc(db, 'hall_power_policies', docId);
        const existing = await getDoc(ref);
        if (existing.exists()) {
          await updateDoc(ref, {
            thresholdPct: Math.round(Math.max(75, Math.min(115, policy.thresholdPct))),
            hysteresisKw: Math.round(Math.max(0.05, Math.min(1.5, policy.hysteresisKw)) * 100) / 100,
            enabled: Boolean(policy.enabled),
            updatedBy: updatedBy.slice(0, 100),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerUid: auth.currentUser.uid,
            siteId,
            hallId: policy.hallId,
            thresholdPct: Math.round(Math.max(75, Math.min(115, policy.thresholdPct))),
            hysteresisKw: Math.round(Math.max(0.05, Math.min(1.5, policy.hysteresisKw)) * 100) / 100,
            enabled: Boolean(policy.enabled),
            updatedBy: updatedBy.slice(0, 100),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    []
  );

  const saveHallThermalPolicyCloud = useCallback(
    async (
      siteId: SiteId,
      policy: HallThermalPolicy,
      updatedBy: string
    ): Promise<boolean> => {
      if (!auth.currentUser) return false;
      const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${siteId}_${policy.hallId}`);
      const path = `hall_thermal_policies/${docId}`;
      const warningTempC = Math.round(Math.max(50, Math.min(80, policy.warningTempC)) * 10) / 10;
      const criticalTempC =
        Math.round(Math.max(warningTempC + 2, Math.min(90, Math.max(55, policy.criticalTempC))) * 10) /
        10;
      const hysteresisC = Math.round(Math.max(0.5, Math.min(5.0, policy.hysteresisC)) * 10) / 10;
      try {
        const ref = doc(db, 'hall_thermal_policies', docId);
        const existing = await getDoc(ref);
        if (existing.exists()) {
          await updateDoc(ref, {
            warningTempC,
            criticalTempC,
            hysteresisC,
            enabled: Boolean(policy.enabled),
            updatedBy: updatedBy.slice(0, 100),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerUid: auth.currentUser.uid,
            siteId,
            hallId: policy.hallId,
            warningTempC,
            criticalTempC,
            hysteresisC,
            enabled: Boolean(policy.enabled),
            updatedBy: updatedBy.slice(0, 100),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    []
  );

  const syncAlertStateCloud = useCallback(
    async (payload: {
      siteId: SiteId;
      alertId: string;
      state: AlertState;
      actorName: string;
    }) => {
      if (!auth.currentUser) return;
      const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${payload.siteId}_${payload.alertId}`);
      const path = `alert_states/${docId}`;
      try {
        const ref = doc(db, 'alert_states', docId);
        const existing = await getDoc(ref);
        if (existing.exists()) {
          await updateDoc(ref, {
            state: payload.state,
            actorName: payload.actorName.slice(0, 100),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerUid: auth.currentUser.uid,
            siteId: payload.siteId,
            alertId: payload.alertId.slice(0, 80),
            state: payload.state,
            actorName: payload.actorName.slice(0, 100),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    []
  );

  const syncCustomAlertRuleCloud = useCallback(
    async (payload: {
      siteId: SiteId;
      ruleId: string;
      name: string;
      metric: string;
      operator: ComparisonOp;
      threshold: number;
      severity: Severity;
      scopeHall: HallId | 'all';
      enabled: boolean;
    }) => {
      if (!auth.currentUser) return;
      const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${payload.siteId}_${payload.ruleId}`);
      const path = `custom_alert_rules/${docId}`;
      try {
        const ref = doc(db, 'custom_alert_rules', docId);
        const existing = await getDoc(ref);
        const clampedThreshold = Math.max(0, Math.min(100000, Number(payload.threshold) || 0));
        if (existing.exists()) {
          await updateDoc(ref, {
            enabled: Boolean(payload.enabled),
            threshold: clampedThreshold,
            severity: payload.severity,
            name: payload.name.slice(0, 140),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerUid: auth.currentUser.uid,
            siteId: payload.siteId,
            ruleId: payload.ruleId.slice(0, 64),
            name: payload.name.slice(0, 140),
            metric: payload.metric.slice(0, 40),
            operator: payload.operator,
            threshold: clampedThreshold,
            severity: payload.severity,
            scopeHall: payload.scopeHall,
            enabled: Boolean(payload.enabled),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    []
  );

  const deleteCustomAlertRuleCloud = useCallback(async (siteId: SiteId, ruleId: string) => {
    if (!auth.currentUser) return;
    const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${siteId}_${ruleId}`);
    const path = `custom_alert_rules/${docId}`;
    try {
      await deleteDoc(doc(db, 'custom_alert_rules', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }, []);

  const syncVisitorCloud = useCallback(
    async (payload: {
      visitorId: string;
      siteId: SiteId;
      fullName: string;
      company: string;
      status: 'Pre-Registered' | 'Checked In' | 'Checked Out' | 'Revoked';
      escortName: string;
      badgeNumber: string;
    }) => {
      if (!auth.currentUser) return;
      const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${payload.visitorId}`);
      const path = `site_visitors/${docId}`;
      try {
        const ref = doc(db, 'site_visitors', docId);
        const existing = await getDoc(ref);
        if (existing.exists()) {
          await updateDoc(ref, {
            status: payload.status,
            badgeNumber: payload.badgeNumber.slice(0, 40),
            escortName: payload.escortName.slice(0, 100),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerUid: auth.currentUser.uid,
            visitorId: payload.visitorId.slice(0, 64),
            siteId: payload.siteId,
            fullName: payload.fullName.slice(0, 120),
            company: payload.company.slice(0, 120),
            status: payload.status,
            escortName: payload.escortName.slice(0, 100),
            badgeNumber: payload.badgeNumber.slice(0, 40),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    []
  );

  const syncIncidentRunbookCloud = useCallback(
    async (payload: {
      runbookId: string;
      alertId: string;
      siteId: SiteId;
      title: string;
      assignedEngineerName: string;
      completedSteps: number;
      totalSteps: number;
      appendedToHandover: boolean;
      notes: string;
    }) => {
      if (!auth.currentUser) return;
      const docId = sanitizeFirestoreId(`${auth.currentUser.uid}_${payload.runbookId}`);
      const path = `incident_runbooks/${docId}`;
      const totalSteps = Math.max(1, Math.min(20, Math.round(payload.totalSteps)));
      const completedSteps = Math.max(0, Math.min(totalSteps, Math.round(payload.completedSteps)));
      try {
        const ref = doc(db, 'incident_runbooks', docId);
        const existing = await getDoc(ref);
        if (existing.exists()) {
          await updateDoc(ref, {
            assignedEngineerName: payload.assignedEngineerName.slice(0, 100),
            completedSteps,
            appendedToHandover: Boolean(payload.appendedToHandover),
            notes: payload.notes.slice(0, 1000),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerUid: auth.currentUser.uid,
            runbookId: payload.runbookId.slice(0, 80),
            alertId: payload.alertId.slice(0, 80),
            siteId: payload.siteId,
            title: payload.title.slice(0, 220),
            assignedEngineerName: payload.assignedEngineerName.slice(0, 100),
            completedSteps,
            totalSteps,
            appendedToHandover: Boolean(payload.appendedToHandover),
            notes: payload.notes.slice(0, 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    []
  );

  const cloudSyncBreakdown: CloudSyncBreakdown = {
    handovers: cloudHandovers.length,
    maintenanceWindows: cloudMaintenanceWindows.length,
    hallPolicies: cloudHallPolicies.length,
    hallThermalPolicies: cloudHallThermalPolicies.length,
    tickets: cloudTicketsCount,
    alertStates: cloudAlertStates.length,
    customRules: cloudCustomRules.length,
    visitors: cloudVisitors.length,
    runbooks: cloudRunbooks.length,
  };

  const cloudSyncedCount =
    cloudSyncBreakdown.handovers +
    cloudSyncBreakdown.maintenanceWindows +
    cloudSyncBreakdown.hallPolicies +
    cloudSyncBreakdown.hallThermalPolicies +
    cloudSyncBreakdown.tickets +
    cloudSyncBreakdown.alertStates +
    cloudSyncBreakdown.customRules +
    cloudSyncBreakdown.visitors +
    cloudSyncBreakdown.runbooks;

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        signingIn,
        authError,
        cloudSyncedCount,
        cloudSyncBreakdown,
        cloudHandovers,
        cloudMaintenanceWindows,
        cloudHallPolicies,
        cloudHallThermalPolicies,
        cloudAlertStates,
        cloudCustomRules,
        cloudVisitors,
        cloudRunbooks,
        signInWithGoogle,
        signOutUser,
        saveShiftHandoverCloud,
        saveMaintenanceWindowCloud,
        endMaintenanceWindowCloud,
        deleteMaintenanceWindowCloud,
        syncTicketCloud,
        syncAuditEventCloud,
        saveHallPowerPolicyCloud,
        saveHallThermalPolicyCloud,
        syncAlertStateCloud,
        syncCustomAlertRuleCloud,
        deleteCustomAlertRuleCloud,
        syncVisitorCloud,
        syncIncidentRunbookCloud,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
