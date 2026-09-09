package anbar.station.caller

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * شاشة طلب توترز، كما هي، إلى ستيشن.
 *
 * لا واجهة برمجية عند توترز. الطلب كاملاً — الأصناف والكميات والخيارات
 * والزبون — موجود في مكان واحد فقط: شاشة تفاصيل الطلب على هذا الجهاز حين
 * يفتحها المجهّز. هذه الخدمة تقرأ نصّ تلك الشاشة وترسله.
 *
 * ولا تفهمه. الفهم كله على الخادم (parseTotersScreen): حين يغيّر توترز شكل
 * شاشته يُصلَح المحلّل هناك في دقائق ولا يُثبَّت تطبيق جديد على الجهاز.
 * الشرط الوحيد هنا: سطر «الطلب #…» — كل ما عداه يُرسَل بلا رأي.
 */
class TotersReaderService : AccessibilityService() {

  private val handler = Handler(Looper.getMainLooper())
  private var pending: Runnable? = null

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // القوائم تُرسم تدريجياً: انتظر هدوءاً قصيراً ثم اقرأ الشاشة كاملة مرّة واحدة
    pending?.let { handler.removeCallbacks(it) }
    val r = Runnable { readAndSend() }
    pending = r
    handler.postDelayed(r, 1500)
  }

  override fun onInterrupt() {}

  private fun readAndSend() {
    val root: AccessibilityNodeInfo = rootInActiveWindow ?: return
    val lines = ArrayList<String>()
    collect(root, lines, 0)
    if (lines.isEmpty()) return

    val ref = lines.firstNotNullOfOrNull { REF.find(latin(it))?.groupValues?.get(1) } ?: return

    // المرجع نفسه لا يُرسَل ثانيةً خلال نصف ساعة — إلا إن ظهرت أسطر أكثر
    // (المجهّز مرّر الشاشة فظهرت بقية الأصناف)، فيُرسَل مع again=true
    val p = prefs(this)
    val now = System.currentTimeMillis()
    val sameRef = p.getString(SCREEN_REF, "") == ref && now - p.getLong(SCREEN_AT, 0L) < 30 * 60_000L
    val lastCount = p.getInt(SCREEN_LINES, 0)
    if (sameRef && lines.size <= lastCount) return
    p.edit().putString(SCREEN_REF, ref).putLong(SCREEN_AT, now).putInt(SCREEN_LINES, lines.size).apply()

    val arr = JSONArray()
    for (l in lines) arr.put(l)
    val body = JSONObject()
      .put("secret", p.getString(SECRET_KEY, "") ?: "")
      .put("app", "com.toters.totersmerchant")
      .put("title", "screen")
      .put("text", lines.joinToString("\n"))
      .put("lines", arr)
      .put("ref", ref)
      .put("again", sameRef)
    val ctx = this
    Thread { post(ctx, body, "شاشة توترز #$ref", ordersUrl(ctx)) }.start()
  }

  /** النصوص المرئية بترتيب الشجرة — ترتيب القراءة على الشاشة */
  private fun collect(n: AccessibilityNodeInfo?, out: MutableList<String>, depth: Int) {
    if (n == null || depth > 60) return
    if (n.isVisibleToUser) {
      val t = n.text?.toString()?.trim().orEmpty()
      val d = n.contentDescription?.toString()?.trim().orEmpty()
      if (t.isNotEmpty()) out.add(t)
      else if (d.isNotEmpty()) out.add(d)
    }
    for (i in 0 until n.childCount) collect(n.getChild(i), out, depth + 1)
  }

  private fun latin(s: String): String {
    val sb = StringBuilder(s.length)
    for (ch in s) {
      val i = ARABIC_DIGITS.indexOf(ch)
      sb.append(if (i >= 0) ('0' + i) else ch)
    }
    return sb.toString()
  }

  companion object {
    private const val SCREEN_REF = "screen_ref"
    private const val SCREEN_AT = "screen_at"
    private const val SCREEN_LINES = "screen_lines"
    private const val ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
    private val REF = Regex("""الطلب\s*#\s*(\d{2,7})""")
  }
}
