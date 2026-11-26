import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Flame,
  Globe,
  Plus,
  RotateCcw,
  Send,
  Server,
  ShieldAlert,
  Sliders,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { DEFAULT_HALL_THERMAL_POLICIES } from '../engine/hallThermalPolicyEngine';
import { RackThermalStat } from '../engine/rackHeatmapEngine';
import {
  DEFAULT_HALL_POWER_POLICIES,
  RackBmsPowerStat,
} from '../engine/rackPowerEngine';
import { HALL_CONFIGS, HALL_LABELS, METRIC_META } from '../engine/seedData';
import { validateAlertRuleDraft } from '../engine/telemetryEngine';
import {
  AlertRule,
  AlertRuleDraft,
  AlertRuleType,
  ComparisonOp,
  HallId,
  HallPowerCapacityPolicy,
  HallPowerPolicyMap,
  HallThermalPolicy,
  HallThermalPolicyMap,
  MetricKey,
  NotificationChannel,
  RackDefinition,
  Severity,
} from '../engine/types';
import { formatWebhookPayload, validateWebhookUrl, WebhookChannelFormat } from '../engine/webhookEngine';
import { formatRelativeTime, SeverityLabel } from './StatusIndicator';

interface RulesViewProps {
  rules: AlertRule[];
  channels: NotificationChannel[];
  liveFacilityPowerMw?: number;
  siteCode?: string;
  hallPowerPolicies?: HallPowerPolicyMap;
  hallThermalPolicies?: HallThermalPolicyMap;
  racks?: RackDefinition[];
  rackPowerStats?: Record<string, RackBmsPowerStat>;
  rackThermalStats?: Record<string, RackThermalStat>;
  cloudSynced?: boolean;
  onUpdateHallPowerPolicy?: (hallId: HallId, patch: Partial<HallPowerCapacityPolicy>) => void;
  onResetHallPowerPolicies?: () => void;
  onUpdateHallThermalPolicy?: (hallId: HallId, patch: Partial<HallThermalPolicy>) => void;
  onResetHallThermalPolicies?: () => void;
  onToggleRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onCreateRule: (rule: Omit<AlertRule, 'id'>) => void;
  onToggleChannel: (channelId: string) => void;
  onTestChannel: (channelId: string) => void;
}

const DEFAULT_SERVER_DRAFT: AlertRuleDraft = {
  name: '',
  ruleType: 'server_telemetry',
  metric: 'tempC',
  operator: '>=',
  threshold: '75',
  sustainedDurationSec: '60',
  severity: 'warning',
  scopeHall: 'all',
  channelIds: ['ch-slack'],
  autoResolve: true,
  cooldownSec: '60',
};

const DEFAULT_POWER_SURGE_DRAFT: AlertRuleDraft = {
  name: '',
  ruleType: 'facility_power_surge',
  metric: 'facilityPowerMw',
  operator: '>',
  threshold: '5',
  sustainedDurationSec: '60',
  severity: 'critical',
  scopeHall: 'all',
  channelIds: ['ch-facility-mgmt', 'ch-pagerduty'],
  autoResolve: true,
  cooldownSec: '120',
};

export function RulesView({
  rules,
  channels,
  liveFacilityPowerMw,
  siteCode = 'KL1',
  hallPowerPolicies = DEFAULT_HALL_POWER_POLICIES,
  hallThermalPolicies = DEFAULT_HALL_THERMAL_POLICIES,
  racks = [],
  rackPowerStats,
  rackThermalStats,
  cloudSynced = false,
  onUpdateHallPowerPolicy,
  onResetHallPowerPolicies,
  onUpdateHallThermalPolicy,
  onResetHallThermalPolicies,
  onToggleRule,
  onDeleteRule,
  onCreateRule,
  onToggleChannel,
  onTestChannel,
}: RulesViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<AlertRuleDraft>(DEFAULT_SERVER_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof AlertRuleDraft, string>>>({});

  // Outbound Webhook Tester state
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [webhookChannelName, setWebhookChannelName] = useState('NOC Escalation Endpoint');
  const [webhookFormat, setWebhookFormat] = useState<WebhookChannelFormat>('Slack');
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.slack.com/services/T00000000/B00000000/EXAMPLE');
  const [webhookSeverity, setWebhookSeverity] = useState<'critical' | 'warning' | 'info'>('warning');
  const [webhookMessage, setWebhookMessage] = useState(
    'Scheduled DCIM outbound alert webhook connectivity verification.'
  );
  const [webhookDryRun, setWebhookDryRun] = useState(true);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{
    ok: boolean;
    dryRun?: boolean;
    status?: number;
    latencyMs?: number;
    error?: string;
    responsePreview?: string;
  } | null>(null);

  const isPowerSurgeDraft = draft.ruleType === 'facility_power_surge';

  const openWebhookTester = (ch?: NotificationChannel) => {
    const lowerName = (ch?.name ?? '').toLowerCase();
    const mappedFormat: WebhookChannelFormat =
      ch?.type === 'PagerDuty' || lowerName.includes('pager')
        ? 'PagerDuty'
        : lowerName.includes('teams')
        ? 'Teams'
        : ch?.type === 'Slack'
        ? 'Slack'
        : 'Webhook';
    setWebhookChannelName(ch?.name ?? 'NOC Escalation Endpoint');
    setWebhookFormat(mappedFormat);
    const defaultUrl =
      ch?.target && ch.target.startsWith('https://')
        ? ch.target
        : mappedFormat === 'PagerDuty'
        ? 'https://events.pagerduty.com/v2/enqueue'
        : mappedFormat === 'Teams'
        ? 'https://outlook.office.com/webhook/orise-dcim-ops'
        : 'https://hooks.slack.com/services/T00000000/B00000000/EXAMPLE';
    setWebhookUrl(defaultUrl);
    setWebhookDryRun(true);
    setWebhookResult(null);
    setWebhookModalOpen(true);
  };

  useEffect(() => {
    if (!webhookModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWebhookModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [webhookModalOpen]);

  const clientUrlValidation = useMemo(() => validateWebhookUrl(webhookUrl), [webhookUrl]);

  const webhookPayloadPreview = useMemo(
    () =>
      formatWebhookPayload({
        format: webhookFormat,
        siteCode,
        channelName: webhookChannelName,
        severity: webhookSeverity,
        title: `${siteCode} Outbound Escalation Verification`,
        message: webhookMessage,
        timestampIso: new Date().toISOString().slice(0, 19) + 'Z',
      }),
    [webhookFormat, siteCode, webhookChannelName, webhookSeverity, webhookMessage]
  );

  const handleRunWebhookTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookTesting(true);
    setWebhookResult(null);
    try {
      const resp = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          format: webhookFormat,
          siteCode,
          channelName: webhookChannelName,
          severity: webhookSeverity,
          title: `${siteCode} Outbound Escalation Verification`,
          message: webhookMessage,
          dryRun: webhookDryRun,
        }),
      });
      const data = await resp.json();
      setWebhookResult({
        ok: Boolean(data.ok),
        dryRun: data.dryRun,
        status: data.status ?? resp.status,
        latencyMs: data.latencyMs,
        error: data.error,
        responsePreview: data.responsePreview,
      });
    } catch (err) {
      setWebhookResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to reach server webhook proxy.',
      });
    } finally {
      setWebhookTesting(false);
    }
  };

  const openModal = (initialType: AlertRuleType = 'server_telemetry') => {
    setDraft(initialType === 'facility_power_surge' ? DEFAULT_POWER_SURGE_DRAFT : DEFAULT_SERVER_DRAFT);
    setErrors({});
    setModalOpen(true);
  };

  const switchRuleType = (nextType: AlertRuleType) => {
    if (nextType === draft.ruleType) return;
    setErrors({});
    if (nextType === 'facility_power_surge') {
      const hasFacilityChannel = channels.some((c) => c.id === 'ch-facility-mgmt');
      const defaultChannels = hasFacilityChannel
        ? ['ch-facility-mgmt', 'ch-pagerduty'].filter((id) => channels.some((c) => c.id === id))
        : draft.channelIds;
      setDraft({
        ...DEFAULT_POWER_SURGE_DRAFT,
        name: draft.name,
        channelIds: defaultChannels.length > 0 ? defaultChannels : ['ch-facility-mgmt'],
      });
    } else {
      setDraft({
        ...DEFAULT_SERVER_DRAFT,
        name: draft.name,
      });
    }
  };

  const toggleDraftChannel = (chId: string) => {
    setDraft((prev) => ({
      ...prev,
      channelIds: prev.channelIds.includes(chId)
        ? prev.channelIds.filter((id) => id !== chId)
        : [...prev.channelIds, chId],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateAlertRuleDraft(draft);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    const isSurge = draft.ruleType === 'facility_power_surge';
    const finalChannelIds =
      isSurge && channels.some((c) => c.id === 'ch-facility-mgmt')
        ? Array.from(new Set(['ch-facility-mgmt', ...draft.channelIds]))
        : draft.channelIds;

    onCreateRule({
      name: draft.name.trim(),
      ruleType: draft.ruleType,
      metric: isSurge ? 'facilityPowerMw' : draft.metric,
      operator: draft.operator,
      threshold: Number(draft.threshold),
      sustainedDurationSec: isSurge ? Number(draft.sustainedDurationSec) : undefined,
      breachStartedAt: null,
      severity: draft.severity,
      scopeHall: isSurge ? 'all' : draft.scopeHall,
      channelIds: finalChannelIds,
      enabled: true,
      autoResolve: draft.autoResolve,
      cooldownSec: Number(draft.cooldownSec),
    });
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Automated Alert Rules &amp; Channels
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configure continuous server telemetry and facility-wide power surge escalation policies
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="rules-webhook-tester-header-btn"
            onClick={() => openWebhookTester()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
            Webhook Tester
          </button>
          <button
            type="button"
            onClick={() => openModal('facility_power_surge')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-950/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            New Power Surge Rule
          </button>
          <button
            type="button"
            onClick={() => openModal('server_telemetry')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Alert Rule
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <section
        aria-label="Automated Alert Rules"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Active Monitoring Policies ({rules.filter((r) => r.enabled).length} of {rules.length} enabled)
          </h2>
          {typeof liveFacilityPowerMw === 'number' && (
            <div className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Live {siteCode} Facility Load:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {liveFacilityPowerMw.toFixed(2)} MW
              </span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-5 pr-3">Policy Name &amp; Type</th>
                <th className="py-3 px-3">Condition</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Scope</th>
                <th className="py-3 px-3">Dispatch Channels</th>
                <th className="py-3 px-3">State</th>
                <th className="py-3 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {rules.map((rule) => {
                const isFacilitySurge =
                  rule.ruleType === 'facility_power_surge' || rule.metric === 'facilityPowerMw';
                const metricMeta = METRIC_META[rule.metric];
                const chNames = rule.channelIds
                  .map((id) => channels.find((c) => c.id === id)?.name)
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <tr
                    key={rule.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      !rule.enabled ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {rule.name}
                        </span>
                        {isFacilitySurge ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border border-amber-200 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 whitespace-nowrap">
                            <Zap className="w-3 h-3" aria-hidden="true" />
                            Facility Power Surge
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            <Server className="w-3 h-3" aria-hidden="true" />
                            Server Telemetry
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Cooldown {rule.cooldownSec}s · {rule.autoResolve ? 'Auto-resolve on recovery' : 'Manual resolve'}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                      <div>
                        {metricMeta?.shortLabel ?? rule.metric} {rule.operator} {rule.threshold}
                        {metricMeta?.unit ? ` ${metricMeta.unit}` : ''}
                      </div>
                      {isFacilitySurge && (
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Sustained {rule.sustainedDurationSec ?? 60}s
                          {rule.enabled && rule.breachStartedAt != null && (
                            <span className="ml-1.5 text-red-600 dark:text-red-400 font-semibold">
                              · Surge active
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <SeverityLabel severity={rule.severity} />
                    </td>
                    <td className="py-3.5 px-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {isFacilitySurge
                        ? 'Entire Facility (All Halls + MEP)'
                        : rule.scopeHall === 'all'
                        ? 'All Data Halls'
                        : HALL_LABELS[rule.scopeHall]}
                    </td>
                    <td className="py-3.5 px-3 text-xs text-slate-600 dark:text-slate-400 max-w-[240px]">
                      {chNames || 'None'}
                    </td>
                    <td className="py-3.5 px-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        aria-label={`Toggle rule ${rule.name}`}
                        onClick={() => onToggleRule(rule.id)}
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                          rule.enabled
                            ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'Enabled' : 'Paused'}
                      </button>
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteRule(rule.id)}
                        aria-label={`Delete rule ${rule.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Configurable Per-Hall Rack Power Capacity Thresholds */}
      {onUpdateHallPowerPolicy && (
        <section
          aria-label="Per-Hall Power Capacity Thresholds"
          data-testid="hall-power-policies-panel"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                Per-Hall Rack Power Capacity Thresholds ({siteCode})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tune Critical Power Capacity trigger percentage (75%–115%) and auto-resolve hysteresis per data hall — live-coupled to Rack Map, 3D Beacons, and NOC Alerts
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                data-testid="hall-policies-sync-status"
                className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                  cloudSynced
                    ? 'text-[#007A27] dark:text-[#3DCD58]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                {cloudSynced ? 'Firestore Synced' : 'Local Persisted'}
              </span>
              {onResetHallPowerPolicies && (
                <button
                  type="button"
                  data-testid="hall-policies-reset-btn"
                  onClick={onResetHallPowerPolicies}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Reset Defaults
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {HALL_CONFIGS.map((hc) => {
              const policy = hallPowerPolicies[hc.id] ?? DEFAULT_HALL_POWER_POLICIES[hc.id];
              const effectiveLimitKw = Number(
                ((hc.powerCapacityKw * policy.thresholdPct) / 100).toFixed(2)
              );
              const overCapCount = rackPowerStats
                ? racks.filter(
                    (r) => r.hallId === hc.id && rackPowerStats[r.id]?.exceedsCapacity
                  ).length
                : 0;
              return (
                <div
                  key={hc.id}
                  data-testid={`hall-policy-card-${hc.id}`}
                  className={`p-4 space-y-3 ${!policy.enabled ? 'opacity-65' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {hc.label}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        Rated {hc.powerCapacityKw} kW → Limit{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {effectiveLimitKw.toFixed(1)} kW
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={policy.enabled}
                      data-testid={`hall-policy-toggle-${hc.id}`}
                      onClick={() =>
                        onUpdateHallPowerPolicy(hc.id, { enabled: !policy.enabled })
                      }
                      className={`px-2 py-0.5 text-[11px] font-medium rounded border cursor-pointer shrink-0 ${
                        policy.enabled
                          ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {policy.enabled ? 'Active' : 'Paused'}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor={`threshold-pct-${hc.id}`}
                        className="text-slate-600 dark:text-slate-400"
                      >
                        Alert Threshold
                      </label>
                      <span
                        data-testid={`hall-policy-pct-val-${hc.id}`}
                        className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                      >
                        {policy.thresholdPct}%
                      </span>
                    </div>
                    <input
                      id={`threshold-pct-${hc.id}`}
                      data-testid={`hall-policy-slider-${hc.id}`}
                      type="range"
                      min={75}
                      max={115}
                      step={1}
                      disabled={!policy.enabled}
                      value={policy.thresholdPct}
                      onChange={(e) =>
                        onUpdateHallPowerPolicy(hc.id, { thresholdPct: Number(e.target.value) })
                      }
                      className="w-full accent-[#009530] cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                    <label
                      htmlFor={`hysteresis-${hc.id}`}
                      className="text-[11px] text-slate-500 dark:text-slate-400"
                    >
                      Hysteresis (kW)
                    </label>
                    <input
                      id={`hysteresis-${hc.id}`}
                      data-testid={`hall-policy-hyst-${hc.id}`}
                      type="number"
                      min={0.05}
                      max={1.5}
                      step={0.05}
                      disabled={!policy.enabled}
                      value={policy.hysteresisKw}
                      onChange={(e) =>
                        onUpdateHallPowerPolicy(hc.id, { hysteresisKw: Number(e.target.value) })
                      }
                      className="w-18 px-2 py-1 text-right font-mono text-xs tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-slate-500 dark:text-slate-400">Live Breaches</span>
                    <span
                      data-testid={`hall-policy-overcap-${hc.id}`}
                      className={
                        overCapCount > 0
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-[#007A27] dark:text-[#3DCD58]'
                      }
                    >
                      {overCapCount > 0 ? `${overCapCount} Over Cap` : '0 Breaches'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Configurable Per-Hall Rack Thermal Sensor Policies */}
      {onUpdateHallThermalPolicy && (
        <section
          aria-label="Per-Hall Thermal Sensor Thresholds"
          data-testid="hall-thermal-policies-panel"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500 dark:text-orange-400" aria-hidden="true" />
                Per-Hall Rack Thermal Sensor Thresholds ({siteCode})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure per-hall Warning °C (50–80°C), Critical °C (55–90°C), and auto-resolve hysteresis for average rack server temperatures — synced across workstations
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                data-testid="hall-thermal-policies-sync-status"
                className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                  cloudSynced
                    ? 'text-[#007A27] dark:text-[#3DCD58]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                {cloudSynced ? 'Firestore Synced' : 'Local Persisted'}
              </span>
              {onResetHallThermalPolicies && (
                <button
                  type="button"
                  data-testid="hall-thermal-policies-reset-btn"
                  onClick={onResetHallThermalPolicies}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Reset Defaults
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {HALL_CONFIGS.map((hc) => {
              const policy = hallThermalPolicies[hc.id] ?? DEFAULT_HALL_THERMAL_POLICIES[hc.id];
              const breachCount = rackThermalStats
                ? racks.filter((r) => {
                    if (r.hallId !== hc.id || !policy.enabled) return false;
                    const stat = rackThermalStats[r.id];
                    return Boolean(stat && stat.hasLiveServers && stat.avgTempC >= policy.warningTempC);
                  }).length
                : 0;
              return (
                <div
                  key={hc.id}
                  data-testid={`hall-thermal-card-${hc.id}`}
                  className={`p-4 space-y-3 ${!policy.enabled ? 'opacity-65' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {hc.label}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        Warn {policy.warningTempC.toFixed(1)}°C · Crit{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {policy.criticalTempC.toFixed(1)}°C
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={policy.enabled}
                      data-testid={`hall-thermal-toggle-${hc.id}`}
                      onClick={() =>
                        onUpdateHallThermalPolicy(hc.id, { enabled: !policy.enabled })
                      }
                      className={`px-2 py-0.5 text-[11px] font-medium rounded border cursor-pointer shrink-0 ${
                        policy.enabled
                          ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {policy.enabled ? 'Active' : 'Paused'}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor={`thermal-warn-${hc.id}`}
                        className="text-slate-600 dark:text-slate-400"
                      >
                        Warning (°C)
                      </label>
                      <span
                        data-testid={`hall-thermal-warn-val-${hc.id}`}
                        className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                      >
                        {policy.warningTempC.toFixed(1)}°C
                      </span>
                    </div>
                    <input
                      id={`thermal-warn-${hc.id}`}
                      data-testid={`hall-thermal-warn-slider-${hc.id}`}
                      type="range"
                      min={50}
                      max={80}
                      step={1}
                      disabled={!policy.enabled}
                      value={policy.warningTempC}
                      onChange={(e) => {
                        const nextWarn = Number(e.target.value);
                        onUpdateHallThermalPolicy(hc.id, {
                          warningTempC: nextWarn,
                          criticalTempC: Math.max(policy.criticalTempC, nextWarn + 2),
                        });
                      }}
                      className="w-full accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor={`thermal-crit-${hc.id}`}
                        className="text-slate-600 dark:text-slate-400"
                      >
                        Critical (°C)
                      </label>
                      <span
                        data-testid={`hall-thermal-crit-val-${hc.id}`}
                        className="font-mono font-semibold tabular-nums text-rose-700 dark:text-rose-400"
                      >
                        {policy.criticalTempC.toFixed(1)}°C
                      </span>
                    </div>
                    <input
                      id={`thermal-crit-${hc.id}`}
                      data-testid={`hall-thermal-crit-slider-${hc.id}`}
                      type="range"
                      min={Math.max(55, Math.ceil(policy.warningTempC + 2))}
                      max={90}
                      step={1}
                      disabled={!policy.enabled}
                      value={policy.criticalTempC}
                      onChange={(e) =>
                        onUpdateHallThermalPolicy(hc.id, { criticalTempC: Number(e.target.value) })
                      }
                      className="w-full accent-rose-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                    <label
                      htmlFor={`thermal-hyst-${hc.id}`}
                      className="text-[11px] text-slate-500 dark:text-slate-400"
                    >
                      Hysteresis (°C)
                    </label>
                    <input
                      id={`thermal-hyst-${hc.id}`}
                      data-testid={`hall-thermal-hyst-${hc.id}`}
                      type="number"
                      min={0.5}
                      max={5.0}
                      step={0.5}
                      disabled={!policy.enabled}
                      value={policy.hysteresisC}
                      onChange={(e) =>
                        onUpdateHallThermalPolicy(hc.id, { hysteresisC: Number(e.target.value) })
                      }
                      className="w-18 px-2 py-1 text-right font-mono text-xs tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-slate-500 dark:text-slate-400">Active Violations</span>
                    <span
                      data-testid={`hall-thermal-breach-${hc.id}`}
                      className={
                        breachCount > 0
                          ? 'font-semibold text-orange-600 dark:text-orange-400'
                          : 'text-[#007A27] dark:text-[#3DCD58]'
                      }
                    >
                      {breachCount > 0 ? `${breachCount} Rack Alert(s)` : '0 Violations'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Notification Channels Section */}
      <section aria-label="Notification Channels" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Notification Escalation Channels
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Automated alerts dispatch simultaneously to all enabled endpoints assigned to a triggered policy
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {ch.name}
                    </span>
                    {ch.id === 'ch-facility-mgmt' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-amber-200 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                        Power Surge Primary
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>{ch.type}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono truncate">{ch.target}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Min severity: <span className="capitalize font-medium text-slate-700 dark:text-slate-300">{ch.minSeverity}</span>
                    {' · '}
                    {ch.deliveryCount} delivered
                    {ch.lastDispatchedAt
                      ? ` · Last sent ${formatRelativeTime(ch.lastDispatchedAt).toLowerCase()}`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ch.enabled}
                  aria-label={`Toggle channel ${ch.name}`}
                  onClick={() => onToggleChannel(ch.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border shrink-0 transition-colors cursor-pointer ${
                    ch.enabled
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {ch.enabled ? 'Active' : 'Muted'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  data-testid={`rules-open-webhook-tester-${ch.id}`}
                  onClick={() => openWebhookTester(ch)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#009530]/40 bg-[#009530]/[0.06] text-[#007A27] dark:text-[#3DCD58] hover:bg-[#009530]/15 transition-colors cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                  Test Webhook
                </button>
                <button
                  type="button"
                  onClick={() => onTestChannel(ch.id)}
                  disabled={!ch.enabled}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Send Test Dispatch
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Create Alert Rule Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-rule-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
        >
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 id="create-rule-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Create Automated Alert Rule
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
              {/* Rule Type Selector */}
              <fieldset>
                <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Rule Type
                </legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={!isPowerSurgeDraft}
                    onClick={() => switchRuleType('server_telemetry')}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      !isPowerSurgeDraft
                        ? 'border-[#009530] bg-emerald-50/60 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <Server className="w-4 h-4 mt-0.5 shrink-0 text-[#009530]" aria-hidden="true" />
                    <div>
                      <div className="text-xs font-semibold">Server Telemetry</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Per-node CPU, temp, memory &amp; network
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-pressed={isPowerSurgeDraft}
                    onClick={() => switchRuleType('facility_power_surge')}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      isPowerSurgeDraft
                        ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-slate-900 dark:text-slate-100'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <Zap className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <div>
                      <div className="text-xs font-semibold">Facility Power Surge</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Site-wide MW load over sustained period
                      </div>
                    </div>
                  </button>
                </div>
              </fieldset>

              {isPowerSurgeDraft && (
                <div className="px-3.5 py-2.5 rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/60 dark:bg-amber-950/25 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  Monitors total {siteCode} facility power consumption (IT Load × PUE
                  {typeof liveFacilityPowerMw === 'number' ? `, currently ${liveFacilityPowerMw.toFixed(2)} MW` : ''}).
                  Exceeding the threshold for the sustained period triggers a critical alert and automatically dispatches to{' '}
                  <span className="font-semibold">Facility Management Channel</span>.
                </div>
              )}

              <div>
                <label htmlFor="rule-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Rule Name
                </label>
                <input
                  id="rule-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder={
                    isPowerSurgeDraft
                      ? 'e.g., Campus 5MW Sustained Power Surge'
                      : 'e.g., GPU Rack High Memory Alert'
                  }
                  className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
                {errors.name && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="rule-metric" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Telemetry Metric
                  </label>
                  {isPowerSurgeDraft ? (
                    <select
                      id="rule-metric"
                      value="facilityPowerMw"
                      disabled
                      className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    >
                      <option value="facilityPowerMw">Total Facility Power (MW)</option>
                    </select>
                  ) : (
                    <select
                      id="rule-metric"
                      value={draft.metric}
                      onChange={(e) => setDraft((d) => ({ ...d, metric: e.target.value as MetricKey }))}
                      className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="tempC">Exhaust Temp (°C)</option>
                      <option value="cpu">CPU Utilization (%)</option>
                      <option value="memory">Memory Utilization (%)</option>
                      <option value="powerW">Power Draw (W)</option>
                      <option value="disk">Storage Volume (%)</option>
                      <option value="packetLoss">Packet Loss (%)</option>
                    </select>
                  )}
                </div>

                <div>
                  <label htmlFor="rule-op" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Operator
                  </label>
                  <select
                    id="rule-op"
                    value={draft.operator}
                    onChange={(e) => setDraft((d) => ({ ...d, operator: e.target.value as ComparisonOp }))}
                    className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono"
                  >
                    <option value=">">&gt; (Greater than)</option>
                    <option value=">=">&gt;= (At or above)</option>
                    {!isPowerSurgeDraft && <option value="<">&lt; (Below)</option>}
                  </select>
                </div>

                <div>
                  <label htmlFor="rule-threshold" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Threshold ({METRIC_META[draft.metric]?.unit})
                  </label>
                  <input
                    id="rule-threshold"
                    type="number"
                    step="any"
                    value={draft.threshold}
                    onChange={(e) => setDraft((d) => ({ ...d, threshold: e.target.value }))}
                    placeholder={isPowerSurgeDraft ? '5' : '75'}
                    className="mt-1.5 w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  {errors.threshold && (
                    <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {errors.threshold}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {isPowerSurgeDraft ? (
                  <div>
                    <label
                      htmlFor="rule-sustained-sec"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Sustained Period (sec)
                    </label>
                    <input
                      id="rule-sustained-sec"
                      type="number"
                      min={10}
                      max={3600}
                      value={draft.sustainedDurationSec}
                      onChange={(e) => setDraft((d) => ({ ...d, sustainedDurationSec: e.target.value }))}
                      className="mt-1.5 w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    {errors.sustainedDurationSec && (
                      <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {errors.sustainedDurationSec}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="rule-scope" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Facility Scope
                    </label>
                    <select
                      id="rule-scope"
                      value={draft.scopeHall}
                      onChange={(e) => setDraft((d) => ({ ...d, scopeHall: e.target.value as HallId | 'all' }))}
                      className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="all">All Data Halls</option>
                      <option value="hall-a">Hall A · Core Compute</option>
                      <option value="hall-b">Hall B · AI &amp; GPU</option>
                      <option value="hall-c">Hall C · Storage</option>
                      <option value="hall-d">Hall D · Cloud &amp; Interconnect</option>
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="rule-severity" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Severity
                  </label>
                  <select
                    id="rule-severity"
                    value={draft.severity}
                    onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value as Severity }))}
                    className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="rule-cooldown" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Cooldown (sec)
                  </label>
                  <input
                    id="rule-cooldown"
                    type="number"
                    value={draft.cooldownSec}
                    onChange={(e) => setDraft((d) => ({ ...d, cooldownSec: e.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  {errors.cooldownSec && (
                    <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {errors.cooldownSec}
                    </p>
                  )}
                </div>
              </div>

              {isPowerSurgeDraft && (
                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Facility Scope
                  </span>
                  <div className="mt-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                    Entire Facility (All Data Halls + MEP Switchgear &amp; Cooling)
                  </div>
                </div>
              )}

              <fieldset>
                <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Automated Notification Channels
                </legend>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {channels.map((ch) => {
                    const isAutoFacilityChannel = isPowerSurgeDraft && ch.id === 'ch-facility-mgmt';
                    return (
                      <label
                        key={ch.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-md border cursor-pointer text-xs ${
                          isAutoFacilityChannel
                            ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={draft.channelIds.includes(ch.id)}
                            onChange={() => toggleDraftChannel(ch.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {ch.name}
                          </span>
                        </span>
                        {isAutoFacilityChannel && (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 shrink-0">
                            Auto
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {errors.channelIds && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.channelIds}
                  </p>
                )}
              </fieldset>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.autoResolve}
                  onChange={(e) => setDraft((d) => ({ ...d, autoResolve: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Automatically resolve incident once metric returns inside safe threshold
              </label>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                >
                  Save Alert Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Outbound Webhook Tester Modal */}
      {webhookModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="webhook-tester-title"
          data-testid="webhook-tester-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 id="webhook-tester-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Live Outbound Webhook Tester
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Validate payload formatting and dispatch signed HTTPS requests via the DCIM server proxy
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWebhookModalOpen(false)}
                aria-label="Close webhook tester"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleRunWebhookTest} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="wh-format" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Payload Schema
                  </label>
                  <select
                    id="wh-format"
                    data-testid="webhook-format-select"
                    value={webhookFormat}
                    onChange={(e) => setWebhookFormat(e.target.value as WebhookChannelFormat)}
                    className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151A20] text-slate-900 dark:text-slate-100"
                  >
                    <option value="Slack">Slack Incoming Webhook</option>
                    <option value="PagerDuty">PagerDuty Events v2</option>
                    <option value="Teams">Microsoft Teams Card</option>
                    <option value="Webhook">Generic JSON Webhook</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="wh-severity" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Test Severity
                  </label>
                  <select
                    id="wh-severity"
                    value={webhookSeverity}
                    onChange={(e) => setWebhookSeverity(e.target.value as 'critical' | 'warning' | 'info')}
                    className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151A20] text-slate-900 dark:text-slate-100"
                  >
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Dispatch Mode
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-[#151A20] border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      data-testid="webhook-mode-dryrun"
                      onClick={() => setWebhookDryRun(true)}
                      className={`py-1.5 text-[11px] font-medium rounded-sm cursor-pointer ${
                        webhookDryRun
                          ? 'bg-white dark:bg-[#252A30] text-[#007A27] dark:text-[#3DCD58]'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Dry-Run
                    </button>
                    <button
                      type="button"
                      data-testid="webhook-mode-live"
                      onClick={() => setWebhookDryRun(false)}
                      className={`py-1.5 text-[11px] font-medium rounded-sm cursor-pointer ${
                        !webhookDryRun
                          ? 'bg-white dark:bg-[#252A30] text-amber-700 dark:text-amber-300'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Live POST
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="wh-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Destination HTTPS Endpoint URL
                </label>
                <input
                  id="wh-url"
                  data-testid="webhook-url-input"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="mt-1 w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151A20] text-slate-900 dark:text-slate-100"
                />
                {!clientUrlValidation.valid && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {clientUrlValidation.reason}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="wh-message" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Test Notification Body
                </label>
                <input
                  id="wh-message"
                  type="text"
                  value={webhookMessage}
                  onChange={(e) => setWebhookMessage(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151A20] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Formatted JSON Payload Preview
                </div>
                <pre className="p-3 rounded-md bg-slate-950 text-emerald-300 text-[11px] font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(webhookPayloadPreview, null, 2)}
                </pre>
              </div>

              {webhookResult && (
                <div
                  data-testid="webhook-test-result"
                  className={`p-3 rounded-md border text-xs space-y-1 ${
                    webhookResult.ok
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                      : 'border-red-300 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30 text-red-900 dark:text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {webhookResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                      )}
                      {webhookResult.ok
                        ? webhookResult.dryRun
                          ? 'Dry-Run Validated — Endpoint & Payload Passed Policy Check'
                          : `Delivered (HTTP ${webhookResult.status})`
                        : `Dispatch Rejected / Failed${webhookResult.status ? ` (HTTP ${webhookResult.status})` : ''}`}
                    </span>
                    {typeof webhookResult.latencyMs === 'number' && (
                      <span className="font-mono tabular-nums">{webhookResult.latencyMs} ms</span>
                    )}
                  </div>
                  {webhookResult.error && <p>{webhookResult.error}</p>}
                  {webhookResult.responsePreview && (
                    <p className="font-mono text-[11px] opacity-80 break-all">{webhookResult.responsePreview}</p>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  HTTPS-only · Private &amp; internal networks blocked server-side
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWebhookModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    data-testid="webhook-send-btn"
                    disabled={webhookTesting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] disabled:opacity-50 text-white cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    {webhookTesting
                      ? 'Testing...'
                      : webhookDryRun
                      ? 'Run Dry-Run Validation'
                      : 'Send Live HTTPS POST'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


