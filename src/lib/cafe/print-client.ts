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
  try {
    // no-cors: the agent answers with permissive headers, but we cannot read
    // the response anyway, so success here means "the request left the browser"
    await fetch(`${AGENT}/print`, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
    return true;
  } catch {
    return false;
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
export function pendingPrintCount(): number {
  return readQueue().length;
}

export function clearPrintQueue(): void {
  writeQueue([]);
}
