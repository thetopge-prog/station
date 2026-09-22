import QRCode from "qrcode";
import { requireRole } from "@/lib/cafe/auth";
import { ScannerWizard } from "@/components/cafe/ScannerWizard";

/**
 * /scanner — فحص القارئ خطوةً خطوة.
 *
 * القارئ «لوحة مفاتيح» لا يعرف عنه ويندوز شيئاً؛ حين لا يعمل لا يقول أحد
 * لماذا: مقترن بلا بروفايل كتابة، أو بلا Enter في الآخر، أو بطيء على البلوتوث.
 * هذه الصفحة تُملي الخطوات وتقرأ ما يصل فعلاً وتقول السبب والعلاج — كما فعل
 * المطوّر بيده أول مرّة.
 */
export const dynamic = "force-dynamic";

const TEST_CODE = "TEST-7Q2X";
const TICKET_CODE = "042-7391";

export default async function ScannerPage() {
  await requireRole("expediter", "cashier");
  const opts = { width: 260, margin: 1, errorCorrectionLevel: "M" as const };
  const [testQr, ticketQr] = await Promise.all([QRCode.toDataURL(TEST_CODE, opts), QRCode.toDataURL(TICKET_CODE, opts)]);
  return <ScannerWizard testCode={TEST_CODE} testQr={testQr} ticketCode={TICKET_CODE} ticketQr={ticketQr} />;
}
