export type WebhookChannelFormat = 'Slack' | 'PagerDuty' | 'Teams' | 'Webhook';

export interface WebhookUrlValidation {
  valid: boolean;
  normalizedUrl?: string;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

function isPrivateOrBlockedIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const octets = m.slice(1).map((v) => Number(v));
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return true;
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateOrBlockedIpv6(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!clean.includes(':')) return false;
  if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1') return true;
  if (clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) return true;
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.slice('::ffff:'.length);
    if (isPrivateOrBlockedIpv4(mapped)) return true;
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  return isPrivateOrBlockedIpv4(ip) || isPrivateOrBlockedIpv6(ip);
}

/**
 * Validates outbound webhook destination URLs against SSRF and unsafe scheme attacks.
 * Enforces HTTPS-only and blocks loopback, RFC1918 private networks, link-local, and cloud metadata endpoints.
 */
export function validateWebhookUrl(rawUrl: string): WebhookUrlValidation {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Webhook URL is required.' };
  }
  if (trimmed.length > 512) {
    return { valid: false, reason: 'Webhook URL exceeds maximum length (512 characters).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid URL format. Expected https://hooks.example.com/...' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS webhook endpoints are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Embedded URL credentials are not permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname.length < 3 || !hostname.includes('.')) {
    return { valid: false, reason: 'Webhook destination must be a public FQDN.' };
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return { valid: false, reason: 'Internal, loopback, and metadata hostnames are blocked.' };
  }

  if (isPrivateOrBlockedIpv4(hostname) || isPrivateOrBlockedIpv6(hostname)) {
    return { valid: false, reason: 'Private, loopback, and link-local IP addresses are blocked.' };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
  };
}

export function formatWebhookPayload(params: {
  format: WebhookChannelFormat;
  siteCode: string;
  channelName: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestampIso: string;
}): Record<string, unknown> {
  const { format, siteCode, channelName, severity, title, message, timestampIso } = params;

  if (format === 'Slack') {
    return {
      text: `[${siteCode}] ${severity.toUpperCase()} — ${title}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `[${siteCode}] Orise DCIM Test Alert` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Channel:*\n${channelName}` },
            { type: 'mrkdwn', text: `*Severity:*\n${severity.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Condition:*\n${title}` },
            { type: 'mrkdwn', text: `*Timestamp:*\n${timestampIso}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message },
        },
      ],
    };
  }

  if (format === 'PagerDuty') {
    return {
      event_action: 'trigger',
      dedup_key: `orise-dcim-test-${siteCode.toLowerCase()}`,
      payload: {
        summary: `[${siteCode}] ${title}: ${message}`,
        source: `orise-dcim-${siteCode.toLowerCase()}`,
        severity: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
        timestamp: timestampIso,
        custom_details: {
          channel: channelName,
          site: siteCode,
          tier: 'Uptime Tier IV',
          testDispatch: true,
        },
      },
    };
  }

  if (format === 'Teams') {
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: severity === 'critical' ? 'DC2626' : severity === 'warning' ? 'D97706' : '009530',
      summary: `[${siteCode}] ${title}`,
      sections: [
        {
          activityTitle: `[${siteCode}] Orise DCIM — ${title}`,
          activitySubtitle: `${channelName} · ${timestampIso}`,
          text: message,
        },
      ],
    };
  }

  return {
    source: 'orise-dcim',
    event: 'alert.test_dispatch',
    siteCode,
    channelName,
    severity,
    title,
    message,
    timestamp: timestampIso,
  };
}
