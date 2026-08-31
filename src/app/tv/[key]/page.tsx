import { QueueScreen } from "@/components/cafe/QueueScreen";

/**
 * /tv/<key> — the same ceiling display as /queue?key=…, addressed the short way.
 *
 * This route exists for one reason: somebody has to type the address into a
 * television, once, standing on a ladder, using a remote control whose
 * on-screen keyboard hides `?` and `=` behind a symbol page. Every symbol is
 * several presses and a place to go wrong, and a wrong key produces a screen
 * that says «تحتاج مفتاح عرض» with no hint as to which character was missed.
 *
 * A path segment removes both symbols and lets the key be typed as plain
 * lowercase letters. /queue?key=… keeps working — screens already installed
 * with it must not be broken by a nicer address existing.
 */
export const dynamic = "force-dynamic";

export default async function TvPage({ params }: { params: Promise<{ key: string }> }) {
  // Next already decodes the segment; decoding again would corrupt a key
  // containing a literal %.
  const { key } = await params;
  return <QueueScreen displayKey={key} />;
}
