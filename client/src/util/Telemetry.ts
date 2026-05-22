// Minimal client telemetry — buffer events in memory + optional sendBeacon
// to a configurable collector. No PII collected.

type TelemetryEvent = {
  t: string;
  ts: number;
  v?: number;
  s?: string;
  [k: string]: any;
};

const ENDPOINT = (import.meta as any).env?.VITE_TELEMETRY_URL as string | undefined;
const SESSION_ID = Math.random().toString(36).slice(2, 10);

class TelemetryImpl {
  buffer: TelemetryEvent[] = [];
  flushTimer: any = null;

  log(t: string, payload: Record<string, any> = {}) {
    this.buffer.push({ t, ts: Date.now(), ...payload });
    if (this.buffer.length > 60) this.flush();
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 10_000);
  }

  flush() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (!this.buffer.length) return;
    const payload = { sid: SESSION_ID, events: this.buffer.splice(0, this.buffer.length) };
    if (ENDPOINT && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try { navigator.sendBeacon(ENDPOINT, JSON.stringify(payload)); return; } catch {}
    }
    if ((import.meta as any).env?.DEV) {
      console.debug("[telemetry]", payload);
    }
  }
}

export const Telemetry = new TelemetryImpl();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => Telemetry.flush());
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") Telemetry.flush(); });
}
