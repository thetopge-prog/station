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
  private var lastPkg: String = ""
  // التمرير الآلي: الشاشة لا تحمل إلا ما يظهر منها، والأصناف تحت الحافة لا
  // تدخل شجرة الوصول أصلاً. عند طلب جديد نمرّر القائمة بأنفسنا ثماني مرّات
  // كحدّ أقصى، وكل قراءة مختلفة تُرسَل والخادم يدمجها.
  private var scrollsLeft = 0
  private var scrollRef = ""

  override fun onServiceConnected() {
    super.onServiceConnected()
    // فور التفعيل: «قراءة الشاشة مفعّلة» تصل الكاشير في ثوانٍ
    Thread { Heartbeat.send(this) }.start()
  }

  override fun onDestroy() {
    // فور الإطفاء (أو قتل الخدمة): الكاشير يعرف قبل أن يضيع طلب
    Thread { try { Heartbeat.send(applicationContext) } catch (_: Throwable) {} }.start()
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // التطبيق الذي رُسمت شاشته — توترز أو طلباتي — يذهب مع النصّ ليعرف الخادم الشركة
    event?.packageName?.toString()?.let { if (it.isNotEmpty()) lastPkg = it }
    // القوائم تُرسم تدريجياً: انتظر هدوءاً قصيراً ثم اقرأ الشاشة كاملة مرّة واحدة
    pending?.let { handler.removeCallbacks(it) }
    val r = Runnable { readAndSend() }
    pending = r
    handler.postDelayed(r, 900)
  }

  override fun onInterrupt() {}

  private fun readAndSend() {
    val root: AccessibilityNodeInfo = rootInActiveWindow ?: return
    val pkg = root.packageName?.toString()?.takeIf { it.isNotEmpty() } ?: lastPkg
    if (pkg.isEmpty()) return
    val lines = ArrayList<String>()
    collect(root, lines, 0)
    if (lines.isEmpty()) return

    val ref = lines.firstNotNullOfOrNull { REF.find(latin(it))?.groupValues?.get(1) } ?: return

    // المرجع نفسه خلال نصف ساعة: تُرسَل كل قراءة **مختلفة** (بعد التمرير تظهر
    // أصناف أخرى بعدد أسطر مساوٍ أحياناً — العدّ لا يكفي، البصمة تكفي) مع
    // again=true فيدمجها الخادم مع ما قبلها.
    val p = prefs(this)
    val now = System.currentTimeMillis()
    val sameRef = p.getString(SCREEN_REF, "") == ref && now - p.getLong(SCREEN_AT, 0L) < 30 * 60_000L
    val hash = lines.joinToString("|").hashCode()
    if (sameRef && hash == p.getInt(SCREEN_HASH, 0)) { scrollOn(root, ref); return }
    p.edit().putString(SCREEN_REF, ref).putLong(SCREEN_AT, now).putInt(SCREEN_HASH, hash).apply()
    if (!sameRef) { scrollsLeft = 8; scrollRef = ref }

    val arr = JSONArray()
    for (l in lines) arr.put(l)
    val body = JSONObject()
      .put("secret", p.getString(SECRET_KEY, "") ?: "")
      .put("app", pkg)
      .put("title", "screen")
      .put("text", lines.joinToString("\n"))
      .put("lines", arr)
      .put("ref", ref)
      .put("again", sameRef)
    val ctx = this
    val who = if (pkg.contains("talabat")) "طلباتي" else "توترز"
    Thread { post(ctx, body, "شاشة $who #$ref", ordersUrl(ctx)) }.start()
    scrollOn(root, ref)
  }

  /** مرّر القائمة خطوة؛ التغيير يوقظ onAccessibilityEvent فتُقرأ الشاشة ثانيةً. */
  private fun scrollOn(root: AccessibilityNodeInfo, ref: String) {
    if (scrollsLeft <= 0 || scrollRef != ref) return
    val list = findScrollable(root) ?: return
    scrollsLeft--
    handler.postDelayed({ list.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) }, 350)
  }

  /** أكبر عنصر قابل للتمرير على الشاشة — قائمة الأصناف لا شريط أفقي صغير. */
  private fun findScrollable(n: AccessibilityNodeInfo?, depth: Int = 0): AccessibilityNodeInfo? {
    if (n == null || depth > 60) return null
    var best: AccessibilityNodeInfo? = if (n.isScrollable && n.isVisibleToUser) n else null
    for (i in 0 until n.childCount) {
      val c = findScrollable(n.getChild(i), depth + 1) ?: continue
      if (best == null || c.childCount > best.childCount) best = c
    }
    return best
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
    private const val SCREEN_HASH = "screen_hash"
    private const val ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
    // «الطلب #٩٠٨» عند توترز؛ «طلب رقم 123» / «Order #123» احتياطاً لطلباتي — شكل شاشتها لم يُرَ بعد
    private val REF = Regex("""(?:الطلب|طلب|order)\s*(?:رقم|#|no\.?)?\s*[:#]?\s*(\d{2,9})""", RegexOption.IGNORE_CASE)
  }
}
