import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWebhookPayload, isBlockedIpAddress, validateWebhookUrl } from './webhookEngine';

test('validateWebhookUrl allows public HTTPS destinations and blocks SSRF targets', () => {
  assert.equal(validateWebhookUrl('https://hooks.slack.com/services/T00/B00/XXX').valid, true);
  assert.equal(validateWebhookUrl('https://events.pagerduty.com/v2/enqueue').valid, true);

  // Non-HTTPS schemes blocked
  assert.equal(validateWebhookUrl('http://hooks.slack.com/services/123').valid, false);
  assert.equal(validateWebhookUrl('javascript:alert(1)').valid, false);
  assert.equal(validateWebhookUrl('file:///etc/passwd').valid, false);

  // Loopback, private RFC1918, cloud metadata, and credentials blocked
  assert.equal(validateWebhookUrl('https://localhost:3000/api/test').valid, false);
  assert.equal(validateWebhookUrl('https://127.0.0.1/hook').valid, false);
  assert.equal(validateWebhookUrl('https://169.254.169.254/latest/meta-data/').valid, false);
  assert.equal(validateWebhookUrl('https://metadata.google.internal/computeMetadata/v1/').valid, false);
  assert.equal(validateWebhookUrl('https://10.0.0.12/internal').valid, false);
  assert.equal(validateWebhookUrl('https://192.168.1.50/hook').valid, false);
  assert.equal(validateWebhookUrl('https://172.16.5.2/hook').valid, false);
  assert.equal(validateWebhookUrl('https://user:pass@hooks.slack.com/x').valid, false);

  assert.equal(isBlockedIpAddress('169.254.169.254'), true);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);
});

test('formatWebhookPayload formats Slack, PagerDuty, Teams, and Generic payloads', () => {
  const base = {
    siteCode: 'KL1',
    channelName: 'NOC Primary',
    severity: 'critical' as const,
    title: 'Critical Exhaust Thermal',
    message: 'Rack B-R01-01 reached 82°C',
    timestampIso: '2026-01-01T00:00:00.000Z',
  };

  const slack = formatWebhookPayload({ ...base, format: 'Slack' });
  assert.ok(Array.isArray(slack.blocks));

  const pd = formatWebhookPayload({ ...base, format: 'PagerDuty' });
  assert.equal(pd.event_action, 'trigger');

  const teams = formatWebhookPayload({ ...base, format: 'Teams' });
  assert.equal(teams['@type'], 'MessageCard');

  const generic = formatWebhookPayload({ ...base, format: 'Webhook' });
  assert.equal(generic.source, 'orise-dcim');
});
