// كم عنصراً على كل شاشةٍ في كل لحظةٍ من الدورة؟
// الجواب لا يُؤخذ بالعين: أربع شاشات × أربع عشرة لقطة = ستّ وخمسون صورة.
// يُفتح المتصفّح مرّة، وتُسأل الصفحة نفسها عن العدد.
import { chromium } from "playwright";
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const rows = [];
for (const t of [2000, 9000, 16000, 23000, 30000, 37000, 44000, 51000, 58000, 65000, 72000, 86000, 100000, 120000]) {
  const line = [String(Math.round(t / 1000)).padStart(3) + "s"];
  for (const n of [1, 2, 3, 4]) {
    await pg.goto(`https://stationiraq.com/wall/${n}?t=${t}`, { waitUntil: "networkidle" });
    const here = await pg.evaluate(() => {
      let c = 0;
      for (const e of document.querySelectorAll(".wall-anim")) {
        if (+getComputedStyle(e).opacity <= 0.05) continue;
        const r = e.getBoundingClientRect();
        if (r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && r.width > 8 && r.height > 8) c++;
      }
      return c;
    });
    line.push(String(here).padStart(3));
  }
  rows.push(line.join(" | "));
  console.log(rows[rows.length - 1]);
}
await b.close();
