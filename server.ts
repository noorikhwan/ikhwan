import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_GEMINI_MODEL = 'gemini-4-hydrogen';
const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets to enable live AI analysis.'
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const PRIMARY_TIMEOUT_MS = 15000;

function isTransientHighDemandError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    status === 503 ||
    status === 500 ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('PRIMARY_TIMEOUT')
  );
}

async function callGeminiWithFailover<T>(
  invoke: (model: string, thinkingLevel: ThinkingLevel) => Promise<T>
): Promise<{ result: T; model: string }> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('PRIMARY_TIMEOUT')), PRIMARY_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([invoke(PRIMARY_GEMINI_MODEL, ThinkingLevel.LOW), timeoutPromise]);
      return { result, model: PRIMARY_GEMINI_MODEL };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (primaryErr) {
    if (!isTransientHighDemandError(primaryErr)) {
      throw primaryErr;
    }
    const result = await invoke(FALLBACK_GEMINI_MODEL, ThinkingLevel.MINIMAL);
    return { result, model: FALLBACK_GEMINI_MODEL };
  }
}

function extractReadableErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unexpected Gemini API error';
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // Plain text message
  }
  return raw;
}

function sendAiError(res: Response, err: unknown) {
  const rawMessage = extractReadableErrorMessage(err);
  const statusCode =
    (err as { statusCode?: number; status?: number })?.statusCode ??
    (err as { status?: number })?.status ??
    500;

  let userMessage = rawMessage;
  if (statusCode === 403 || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
    userMessage =
      'Gemini API authentication failed. Verify your Gemini API key in Settings > Secrets and try again.';
  } else if (statusCode === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    userMessage =
      'Gemini API rate limit or quota reached. Wait a moment or check your billing-enabled API key in Settings > Secrets.';
  } else if (statusCode === 404 || rawMessage.includes('NOT_FOUND')) {
    userMessage = 'Requested Gemini model is unavailable. Check model configuration and retry.';
  } else if (statusCode === 503 || rawMessage.includes('high demand') || rawMessage.includes('UNAVAILABLE')) {
    userMessage = 'Gemini API is experiencing temporary high demand (503). Please retry in a few seconds.';
  }

  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    error: userMessage,
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health check for AI service (never exposes key value)
  app.get('/api/ai/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      model: PRIMARY_GEMINI_MODEL,
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  // 0. Secure Outbound Webhook & Alert Integration Tester (Dry-Run + Live HTTPS Delivery)
  app.post('/api/webhooks/test', async (req: Request, res: Response) => {
    try {
      const {
        url,
        format = 'Webhook',
        channelName = 'Custom Webhook',
        siteCode = 'KL1',
        severity = 'warning',
        title = 'Thermal Excursion Integration Test',
        message = 'Test dispatch from Orise DCIM Alert Escalation Engine.',
        dryRun = false,
      } = (req.body ?? {}) as {
        url?: string;
        format?: 'Slack' | 'PagerDuty' | 'Teams' | 'Webhook';
        channelName?: string;
        siteCode?: string;
        severity?: 'critical' | 'warning' | 'info';
        title?: string;
        message?: string;
        dryRun?: boolean;
      };

      const { validateWebhookUrl, formatWebhookPayload, isBlockedIpAddress } = await import(
        './src/engine/webhookEngine.ts'
      );
      const allowedFormats = new Set(['Slack', 'PagerDuty', 'Teams', 'Webhook']);
      const safeFormat = allowedFormats.has(format) ? format : 'Webhook';
      const safeSeverity =
        severity === 'critical' || severity === 'warning' || severity === 'info'
          ? severity
          : 'warning';

      const payload = formatWebhookPayload({
        format: safeFormat,
        siteCode: String(siteCode).slice(0, 12),
        channelName: String(channelName).slice(0, 80),
        severity: safeSeverity,
        title: String(title).slice(0, 140),
        message: String(message).slice(0, 400),
        timestampIso: new Date().toISOString(),
      });

      const validation = validateWebhookUrl(String(url ?? ''));
      if (!validation.valid || !validation.normalizedUrl) {
        res.status(400).json({
          ok: false,
          blocked: true,
          error: validation.reason ?? 'Invalid webhook URL.',
          payload,
        });
        return;
      }

      if (dryRun) {
        res.json({
          ok: true,
          mode: 'dry-run',
          statusCode: 200,
          latencyMs: 2,
          destination: validation.normalizedUrl,
          payload,
          responsePreview: 'Dry-run verified: URL passed HTTPS & private-network security checks.',
        });
        return;
      }

      // Defense-in-depth DNS resolution check against private/loopback/metadata IPs
      const parsedUrl = new URL(validation.normalizedUrl);
      const dns = await import('node:dns/promises');
      try {
        const resolved = await dns.lookup(parsedUrl.hostname, { all: true });
        for (const addr of resolved) {
          if (isBlockedIpAddress(addr.address)) {
            res.status(400).json({
              ok: false,
              blocked: true,
              error: 'Resolved destination IP falls within a blocked private or metadata network.',
              payload,
            });
            return;
          }
        }
      } catch {
        res.status(422).json({
          ok: false,
          error: `Could not resolve destination host "${parsedUrl.hostname}".`,
          payload,
        });
        return;
      }

      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const upstream = await fetch(validation.normalizedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Orise-DCIM-WebhookTester/1.0',
          },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;
        const rawBody = (await upstream.text()).slice(0, 400);
        res.json({
          ok: upstream.ok,
          mode: 'live',
          statusCode: upstream.status,
          latencyMs,
          destination: validation.normalizedUrl,
          payload,
          responsePreview: rawBody || `${upstream.status} ${upstream.statusText}`,
        });
      } catch (fetchErr) {
        const latencyMs = Date.now() - startedAt;
        const msg =
          fetchErr instanceof Error && fetchErr.name === 'AbortError'
            ? 'Webhook endpoint timed out after 6 seconds.'
            : fetchErr instanceof Error
            ? fetchErr.message
            : 'Outbound webhook delivery failed.';
        res.status(502).json({
          ok: false,
          mode: 'live',
          statusCode: 0,
          latencyMs,
          error: msg,
          payload,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected webhook tester error.',
      });
    }
  });

  // 1. Structured AI Predictive Maintenance Diagnostic Audit
  app.post('/api/ai/predictive-audit', async (req: Request, res: Response) => {
    try {
      const { siteContext } = req.body as { siteContext?: unknown };
      if (!siteContext) {
        res.status(400).json({ error: 'Missing siteContext telemetry payload.' });
        return;
      }

      const ai = createGeminiClient();
      const { result: response, model: usedModel } = await callGeminiWithFailover((model, thinkingLevel) =>
        ai.models.generateContent({
          model,
          contents:
            'Perform a comprehensive Tier IV data center predictive maintenance & thermal/energy diagnostic audit on the following live site telemetry and 2-year trend context. Cite specific asset IDs, temperatures, chiller COPs, and PUE figures from the payload.\n\n' +
            JSON.stringify(siteContext),
          config: {
            systemInstruction:
              'You are a Principal Data Center Reliability & Predictive Maintenance Engineer for Orise DCIM (Uptime Institute Tier IV Certified facilities: KL1, KL2, KL3 with 2 Water Chillers + 2×180kL Square Thermal Buffer Tanks + 14 Air Chillers, 6 Air CRACs + 2 Hall B Liquid CDUs, 4 2(N+1) UPS, 8 2(N+1) Standby Generators, 8 Basement B1 Diesel Tanks, and 160 Cold Aisle ASHRAE A1 SLA probes per site). Produce crisp, quantitative, zero-fluff engineering output grounded strictly in the provided telemetry. Keep every field concise and directly actionable.',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                executiveBrief: {
                  type: Type.STRING,
                  description: '2-3 sentence executive reliability & predictive maintenance assessment citing exact site readings.',
                },
                riskPosture: {
                  type: Type.STRING,
                  description: 'One of: Optimal, Guarded, Elevated, Critical.',
                },
                rootCauseCorrelations: {
                  type: Type.ARRAY,
                  description: '2 to 3 cross-system correlations linking IT workloads, CRAC/chiller strain, and Cold Aisle SLA.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      affectedAssets: { type: Type.ARRAY, items: { type: Type.STRING } },
                      explanation: { type: Type.STRING },
                    },
                    required: ['title', 'affectedAssets', 'explanation'],
                  },
                },
                pueOptimization: {
                  type: Type.OBJECT,
                  properties: {
                    estimatedPueGain: { type: Type.STRING, description: 'e.g. "-0.024 PUE (~315 MWh/yr)"' },
                    summary: { type: Type.STRING },
                    actions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['estimatedPueGain', 'summary', 'actions'],
                },
                recommendedWorkOrders: {
                  type: Type.ARRAY,
                  description: '3 to 4 prioritized preventive maintenance work orders.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      assetId: { type: Type.STRING },
                      assetName: { type: Type.STRING },
                      priority: { type: Type.STRING, description: 'One of: P1 - Urgent, P2 - High, P3 - Preventive' },
                      predictedFailureMode: { type: Type.STRING },
                      recommendedAction: { type: Type.STRING },
                      estimatedWindow: { type: Type.STRING },
                      tier4SafetyNote: { type: Type.STRING },
                      expectedImpact: { type: Type.STRING },
                    },
                    required: [
                      'assetId',
                      'assetName',
                      'priority',
                      'predictedFailureMode',
                      'recommendedAction',
                      'estimatedWindow',
                      'tier4SafetyNote',
                      'expectedImpact',
                    ],
                  },
                },
              },
              required: [
                'executiveBrief',
                'riskPosture',
                'rootCauseCorrelations',
                'pueOptimization',
                'recommendedWorkOrders',
              ],
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);

      res.json({
        ...parsed,
        generatedAt: Date.now(),
        model: usedModel,
      });
    } catch (err) {
      sendAiError(res, err);
    }
  });

  // 2. Interactive Orise DCIM AI Operations Copilot
  app.post('/api/ai/copilot', async (req: Request, res: Response) => {
    try {
      const { message, history, siteContext } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        siteContext?: unknown;
      };

      if (!message?.trim()) {
        res.status(400).json({ error: 'Prompt message is required.' });
        return;
      }

      const ai = createGeminiClient();

      const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
      const transcript = recentHistory
        .map((turn) => `${turn.role === 'user' ? 'Operator' : 'Orise AI'}: ${turn.content}`)
        .join('\n\n');

      const prompt = [
        'LIVE SITE TELEMETRY & 2-YEAR TREND SNAPSHOT (JSON):',
        JSON.stringify(siteContext ?? {}),
        transcript ? `\nRECENT CONVERSATION:\n${transcript}` : '',
        `\nOPERATOR QUESTION:\n${message.trim()}`,
      ]
        .filter(Boolean)
        .join('\n');

      const { result: response, model: usedModel } = await callGeminiWithFailover((model, thinkingLevel) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are Orise AI Copilot, an embedded senior Tier IV Data Center Operations & Predictive Maintenance Engineer. Answer concisely (under 220 words unless asked for a detailed plan) using concrete numbers, asset IDs, chiller/CRAC states, Cold Aisle ASHRAE A1 margins, and 2N / 2(N+1) redundancy guidance from the live telemetry JSON. Use short bullet lists and clear headings in plain text/markdown. Never invent assets not in the telemetry.',
            thinkingConfig: { thinkingLevel },
          },
        })
      );

      const reply = (response.text ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
        return;
      }

      res.json({
        reply,
        model: usedModel,
        generatedAt: Date.now(),
      });
    } catch (err) {
      sendAiError(res, err);
    }
  });

  // 3. Asset-Specific Tier IV Zero-Downtime Predictive Maintenance Runbook
  app.post('/api/ai/work-order-runbook', async (req: Request, res: Response) => {
    try {
      const { assetRisk, siteContext } = req.body as {
        assetRisk?: { assetId?: string; assetName?: string };
        siteContext?: unknown;
      };

      if (!assetRisk?.assetId) {
        res.status(400).json({ error: 'Missing assetRisk payload.' });
        return;
      }

      const ai = createGeminiClient();
      const { result: response, model: usedModel } = await callGeminiWithFailover((model, thinkingLevel) =>
        ai.models.generateContent({
          model,
          contents:
            `Generate a Tier IV zero-downtime preventive maintenance runbook for the selected at-risk asset using the live site telemetry.\n\nTARGET ASSET:\n${JSON.stringify(
              assetRisk
            )}\n\nSITE CONTEXT:\n${JSON.stringify(siteContext ?? {})}`,
          config: {
            systemInstruction:
              'You are a Certified Tier IV Critical Facilities Maintenance Lead. Generate a crisp, practical, zero-downtime Method of Procedure (MOP) runbook tailored to the exact asset, its 2N / 2(N+1) redundancy path, and its live anomaly readings. Keep each step concise (1 sentence).',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                estimatedDuration: { type: Type.STRING, description: 'e.g. "45 minutes (Zero IT Downtime)"' },
                tier4IsolationStrategy: { type: Type.STRING },
                requiredTools: { type: Type.ARRAY, items: { type: Type.STRING } },
                preChecks: { type: Type.ARRAY, items: { type: Type.STRING } },
                serviceProcedure: { type: Type.ARRAY, items: { type: Type.STRING } },
                verificationChecks: { type: Type.ARRAY, items: { type: Type.STRING } },
                rollbackCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'title',
                'estimatedDuration',
                'tier4IsolationStrategy',
                'requiredTools',
                'preChecks',
                'serviceProcedure',
                'verificationChecks',
                'rollbackCriteria',
              ],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        assetId: assetRisk.assetId,
        assetName: assetRisk.assetName ?? assetRisk.assetId,
        ...parsed,
        generatedAt: Date.now(),
        model: usedModel,
      });
    } catch (err) {
      sendAiError(res, err);
    }
  });

  // 4. Rannia — Floating Global Tier IV Data Center AI Operations Assistant
  app.post('/api/ai/puteri-rannia', async (req: Request, res: Response) => {
    try {
      const { message, history, siteContext } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        siteContext?: unknown;
      };

      if (!message?.trim()) {
        res.status(400).json({ error: 'Please enter a message for Rannia.' });
        return;
      }

      const ai = createGeminiClient();

      const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
      const transcript = recentHistory
        .map((turn) => `${turn.role === 'user' ? 'Operator' : 'Rannia'}: ${turn.content}`)
        .join('\n\n');

      const prompt = [
        'ACTIVE SITE LIVE TELEMETRY & OPERATIONS CONTEXT (JSON):',
        JSON.stringify(siteContext ?? {}),
        transcript ? `\nRECENT CHAT HISTORY:\n${transcript}` : '',
        `\nOPERATOR MESSAGE:\n${message.trim()}`,
      ]
        .filter(Boolean)
        .join('\n');

      const { result: response, model: usedModel } = await callGeminiWithFailover((model, thinkingLevel) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are Rannia, the dedicated AI Data Center Operations Assistant for Orise DCIM (managing Tier IV facilities KL1, KL2, and KL3). Your tone is warm, composed, sharp, and technically authoritative. Ground every answer strictly in the provided live site telemetry JSON (including site building layout, total facility power MW, PUE, server states, 2 Water Chillers + 2×180kL Square Buffer Tanks + 14 Air Chillers, 8 Standby Generators, 8 Basement B1 Diesel Tanks, 4 UPS, active alerts, power surge rules, and open operations tickets). Keep responses concise (under 180 words unless asked for a detailed procedure), use clean short bullets where helpful, and never invent metrics or assets.',
            thinkingConfig: { thinkingLevel },
          },
        })
      );

      const reply = (response.text ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Rannia received an empty model response. Please retry.' });
        return;
      }

      res.json({
        reply,
        model: usedModel,
        generatedAt: Date.now(),
      });
    } catch (err) {
      sendAiError(res, err);
    }
  });

  const httpServer = http.createServer(app);

  // Dev vs Production Frontend Mounting
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Orise DCIM server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Orise DCIM server:', err);
  process.exit(1);
});
