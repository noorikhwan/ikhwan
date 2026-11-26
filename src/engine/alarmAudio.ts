import { ActiveAlert } from './types';

export type AlarmSoundLevel = 'none' | 'warning' | 'critical';

export interface AlarmSoundDecision {
  level: AlarmSoundLevel;
  unackedCriticalCount: number;
  unackedWarningCount: number;
  shouldSound: boolean;
  cadenceMs: number;
  statusLabel: string;
}

export interface AlarmToneStep {
  delaySec: number;
  durationSec: number;
  frequencyHz: number;
  secondaryFrequencyHz?: number;
  waveform: OscillatorType;
  gain: number;
}

export const ALARM_MUTE_STORAGE_KEY = 'orise-dcim-alarm-muted';

/**
 * Pure policy evaluator: determines whether the audible alarm should sound
 * and at what severity cadence based on currently unacknowledged alerts.
 * Acknowledged and resolved alerts do not keep the horn sounding.
 */
export function computeAlarmSoundDecision(
  alerts: ActiveAlert[],
  muted: boolean
): AlarmSoundDecision {
  let unackedCriticalCount = 0;
  let unackedWarningCount = 0;

  for (const alert of alerts) {
    if (alert.state !== 'active') continue;
    if (alert.severity === 'critical') {
      unackedCriticalCount += 1;
    } else if (alert.severity === 'warning') {
      unackedWarningCount += 1;
    }
  }

  const level: AlarmSoundLevel =
    unackedCriticalCount > 0
      ? 'critical'
      : unackedWarningCount > 0
      ? 'warning'
      : 'none';

  const shouldSound = level !== 'none' && !muted;
  const cadenceMs = level === 'critical' ? 2200 : level === 'warning' ? 4500 : 0;

  let statusLabel: string;
  if (muted) {
    statusLabel =
      level === 'critical'
        ? 'Muted · Critical Active'
        : level === 'warning'
        ? 'Muted · Warning Active'
        : 'Alarm Muted';
  } else if (level === 'critical') {
    statusLabel = 'Sounding · Critical';
  } else if (level === 'warning') {
    statusLabel = 'Sounding · Warning';
  } else {
    statusLabel = 'Sound Armed';
  }

  return {
    level,
    unackedCriticalCount,
    unackedWarningCount,
    shouldSound,
    cadenceMs,
    statusLabel,
  };
}

/**
 * Returns the highest alarm severity among newly arrived unacknowledged alerts
 * so new fault bursts can chime immediately.
 */
export function detectNewAlarmBurstLevel(newAlerts: ActiveAlert[]): AlarmSoundLevel {
  let foundWarning = false;
  for (const a of newAlerts) {
    if (a.state !== 'active') continue;
    if (a.severity === 'critical') return 'critical';
    if (a.severity === 'warning') foundWarning = true;
  }
  return foundWarning ? 'warning' : 'none';
}

/**
 * Distinct, non-harsh industrial SCADA/NOC tone sequences by severity.
 */
export function getAlarmTonePattern(level: Exclude<AlarmSoundLevel, 'none'>): AlarmToneStep[] {
  if (level === 'critical') {
    // Urgent 3-pulse dual-tone SCADA klaxon cadence (880Hz / 660Hz / 880Hz)
    return [
      { delaySec: 0.0, durationSec: 0.16, frequencyHz: 880, secondaryFrequencyHz: 1320, waveform: 'triangle', gain: 0.16 },
      { delaySec: 0.22, durationSec: 0.16, frequencyHz: 660, secondaryFrequencyHz: 990, waveform: 'triangle', gain: 0.15 },
      { delaySec: 0.44, durationSec: 0.22, frequencyHz: 880, secondaryFrequencyHz: 1320, waveform: 'triangle', gain: 0.16 },
    ];
  }
  // Warning: calm two-note NOC chime (587Hz -> 440Hz)
  return [
    { delaySec: 0.0, durationSec: 0.18, frequencyHz: 587.33, waveform: 'sine', gain: 0.12 },
    { delaySec: 0.24, durationSec: 0.24, frequencyHz: 440.0, waveform: 'sine', gain: 0.11 },
  ];
}

export function readSavedAlarmMuted(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(ALARM_MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveAlarmMuted(muted: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(ALARM_MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/**
 * Browser Web Audio API alarm sound controller with automatic autoplay unlock,
 * clean envelope shaping (no pops), instant mute/silence cutoff, and disposal.
 */
export class AlarmAudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeOscillators = new Set<OscillatorNode>();
  private intervalId: number | null = null;
  private currentLevel: AlarmSoundLevel = 'none';
  private currentCadenceMs = 0;
  private muted = false;
  private disposed = false;
  private unlockListenersBound = false;

  private readonly handleUserGesture = () => {
    this.unlock();
  };

  constructor() {
    this.bindUnlockListeners();
  }

  private bindUnlockListeners(): void {
    if (typeof window === 'undefined' || this.unlockListenersBound) return;
    this.unlockListenersBound = true;
    window.addEventListener('pointerdown', this.handleUserGesture, { passive: true });
    window.addEventListener('keydown', this.handleUserGesture, { passive: true });
  }

  private unbindUnlockListeners(): void {
    if (typeof window === 'undefined' || !this.unlockListenersBound) return;
    this.unlockListenersBound = false;
    window.removeEventListener('pointerdown', this.handleUserGesture);
    window.removeEventListener('keydown', this.handleUserGesture);
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = master;
      return ctx;
    } catch {
      return null;
    }
  }

  /**
   * Unlocks a suspended AudioContext after a user gesture and triggers an
   * immediate cadence beat if an unmuted alarm is currently active.
   */
  public unlock(): void {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (!this.disposed && !this.muted && this.currentLevel !== 'none') {
            this.playPattern(this.currentLevel);
          }
        })
        .catch(() => {
          // Browser may still block resume if gesture was not trusted
        });
    }
  }

  /**
   * Synchronizes repeating alarm playback with the latest pure AlarmSoundDecision.
   */
  public sync(decision: AlarmSoundDecision): void {
    if (this.disposed) return;
    const wasSounding = this.intervalId !== null;
    const prevLevel = this.currentLevel;

    this.muted = !decision.shouldSound && decision.level !== 'none';
    this.currentLevel = decision.level;
    this.currentCadenceMs = decision.cadenceMs;

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(decision.shouldSound ? 1 : 0, now, 0.015);
    }

    if (!decision.shouldSound || decision.level === 'none') {
      this.stopLoop();
      this.stopActiveTones();
      return;
    }

    // Restart interval if we weren't sounding or severity/cadence changed
    if (!wasSounding || prevLevel !== decision.level) {
      this.stopLoop();
      this.playPattern(decision.level);
      this.intervalId = window.setInterval(() => {
        if (!this.disposed && this.currentLevel !== 'none') {
          this.playPattern(this.currentLevel);
        }
      }, decision.cadenceMs);
    }
  }

  /**
   * Plays a single audible burst immediately (for newly triggered alerts or manual Test Sound).
   * When `force` is true (e.g., user clicks Test Sound), plays even if currently muted.
   */
  public playBurst(level: Exclude<AlarmSoundLevel, 'none'>, force = false): boolean {
    if (this.disposed) return false;
    if (!force && this.muted) return false;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return false;

    const trigger = () => {
      if (this.disposed) return;
      if (force && this.masterGain) {
        const now = ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(1, now);
      }
      this.playPattern(level);
      if (force && this.muted && this.masterGain) {
        const restoreAt = ctx.currentTime + 0.85;
        this.masterGain.gain.setTargetAtTime(0, restoreAt, 0.02);
      }
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(trigger)
        .catch(() => {});
      return true;
    }

    trigger();
    return true;
  }

  private playPattern(level: Exclude<AlarmSoundLevel, 'none'>): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || ctx.state !== 'running') return;

    const steps = getAlarmTonePattern(level);
    const baseTime = ctx.currentTime + 0.01;

    for (const step of steps) {
      const start = baseTime + step.delaySec;
      const end = start + step.durationSec;

      this.scheduleTone(ctx, step.frequencyHz, step.waveform, step.gain, start, end);
      if (step.secondaryFrequencyHz) {
        this.scheduleTone(
          ctx,
          step.secondaryFrequencyHz,
          'sine',
          step.gain * 0.35,
          start,
          end
        );
      }
    }
  }

  private scheduleTone(
    ctx: AudioContext,
    frequencyHz: number,
    waveform: OscillatorType,
    peakGain: number,
    startTime: number,
    endTime: number
  ): void {
    if (!this.masterGain) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(frequencyHz, startTime);

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
    env.gain.setValueAtTime(peakGain, Math.max(startTime + 0.015, endTime - 0.025));
    env.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(env);
    env.connect(this.masterGain);

    this.activeOscillators.add(osc);
    osc.onended = () => {
      this.activeOscillators.delete(osc);
      osc.disconnect();
      env.disconnect();
    };

    osc.start(startTime);
    osc.stop(endTime + 0.01);
  }

  private stopLoop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private stopActiveTones(): void {
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeOscillators.clear();
  }

  public dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.stopActiveTones();
    this.unbindUnlockListeners();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
