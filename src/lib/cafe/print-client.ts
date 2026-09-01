"use client";

import type { PrintJob } from "./printer-actions";

/**
 * Browser → local print agent.
 *
 * The agent listens on 127.0.0.1:9988 on the cashier PC (scripts/print-agent.ps1).
 * 9988, not 9977: the shop runs the previous system on the same till during the
 * trial and its drawer agent holds 9977. Neither may disturb the other.
 * and is the only thing in the system that can reach a printer: the browser
 * cannot open a TCP socket, and the Next server runs on Netlify with no route
 * into the shop LAN.
 *
 * localhost is exempt from mixed-content blocking, which is why an https page
 * may talk to a plain-http agent at all.
 *
 * THE CASHIER IS NEVER BLOCKED BY A PRINTER. Every failure path here ends in
 * "the sale completed, the paper did not" — jobs are parked in localStorage and
 * retried, never awaited before the order is considered done.
 */

const AGENT = "http://127.0.0.1:9988";
const QUEUE_KEY = "st-print-queue";
const MAX_QUEUE = 40;

export type PrintOutcome = { sent: number; queued: number; agent: boolean };

/** Is the local agent running? Cached per page load; used to warn the cashier. */
export async function agentAlive(timeoutMs = 900): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(`${AGENT}/ping`, { mode: "no-cors", signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

function readQueue(): PrintJob[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PrintJob[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(jobs: PrintJob[]) {
  try {
    // cap it: a printer that has been off all day must not fill localStorage,
    // and a 200-slip backlog is not something anyone wants printed at once
    localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs.slice(-MAX_QUEUE)));
  } catch {
    /* private mode / quota — dropping the retry is better than throwing */
  }
}

async function postJob(job: PrintJob): Promise<boolean> {
  const payload = { method: "POST" as const, headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) };
  try {
    // The agent sends Access-Control-Allow-Origin: * and answers preflights, so
    // its reply IS readable. It used to be sent no-cors, which threw the answer
    // away — «printed» then meant only «the request left the browser», and a
    // ticket the agent rejected looked exactly like one that came out on paper.
    const res = await fetch(`${AGENT}/print`, payload);
    return res.ok;
  } catch {
    // An agent too old to answer a preflight would otherwise stop printing
    // entirely. Blind send, as before — worse information, but not worse paper.
    try {
      await fetch(`${AGENT}/print`, { ...payload, mode: "no-cors" });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Send a batch. Anything that fails is queued and retried on the next call —
 * which the POS makes on every checkout, so a printer that comes back online
 * catches up on its own without anyone pressing anything.
 */
export async function printJobs(jobs: PrintJob[]): Promise<PrintOutcome> {
  const pending = [...readQueue(), ...jobs];
  const failed: PrintJob[] = [];
  let sent = 0;

  for (const job of pending) {
    // an unconfigured printer (no host, no share) is skipped, not queued:
    // retrying it forever would mask the fact that nobody set it up
    if (!job.host && !job.share) continue;
    const ok = await postJob(job);
    if (ok) sent += job.copies;
    else failed.push(job);
  }

  writeQueue(failed);
  return { sent, queued: failed.length, agent: failed.length === 0 || sent > 0 };
}

/** Open the cash drawer without printing (kept from the cafe build). */
export async function kickDrawer(): Promise<void> {
  try {
    await fetch(`${AGENT}/kick`, { mode: "no-cors" });
  } catch {
    /* fire and forget */
  }
}

/** How many slips are waiting on a printer that was unreachable. */
/** one printer as Windows sees it, straight from the agent */
export type AgentPrinter = { name: string; share: string | null; host: string | null; port: string | null };

/**
 * What printers this till actually has.
 *
 * Asked of the agent rather than typed by hand: the names are things like
 * "POS80-25" and "POS-23", four of them, differing by two characters, and they
 * get read off a screen and retyped into another. One typo sends the burger
 * order to the pizza oven and nobody notices until a customer complains.
 */
export async function agentPrinters(timeoutMs = 2500): Promise<AgentPrinter[]> {
  try {
    const res = await fetch(`${AGENT}/printers`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const list = (await res.json()) as AgentPrinter[];
    // the virtual ones are never a receipt printer, and they crowd the real list
    return list.filter((p) => !/OneNote|PDF|XPS|Fax/i.test(p.name));
  } catch {
    return [];
  }
}

export function pendingPrintCount(): number {
  return readQueue().length;
}

export function clearPrintQueue(): void {
  writeQueue([]);
}
