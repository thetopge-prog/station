// Writes public/chime.wav — the two-note bell the waiting-room screen plays
// when an order goes ready.
//   Usage: node scripts/make-chime.mjs
//
// A file, not WebAudio, because the television that needs it runs no
// JavaScript we can rely on: the chime has to be something <audio autoplay>
// can point at. Generated rather than downloaded so it is reproducible, has no
// licence attached to it, and matches the two tones the staff screens already
// use (playTones in src/lib/cafe/chime.ts).
//
// Plain 16-bit PCM WAV. Every browser ever shipped can decode it, which is the
// whole point — an mp3 would be smaller and less certain.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RATE = 22050;
const NOTES = [
  { freq: 880, ms: 200 },
  { freq: 1320, ms: 320 },
];

const samples = [];
for (const { freq, ms } of NOTES) {
  const n = Math.round((RATE * ms) / 1000);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    // a soft attack and a long decay: a square-edged beep sounds like an error,
    // and this has to read as "your food is ready", not "something is wrong"
    const envelope = Math.min(1, i / (RATE * 0.01)) * Math.pow(1 - i / n, 2.2);
    samples.push(Math.round(Math.sin(2 * Math.PI * freq * t) * envelope * 0.6 * 32767));
  }
}

const data = Buffer.alloc(samples.length * 2);
samples.forEach((s, i) => data.writeInt16LE(s, i * 2));

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // format: PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "chime.wav");
writeFileSync(out, Buffer.concat([header, data]));
console.log(`✓ ${out} (${Math.round((44 + data.length) / 1024)} KB)`);
