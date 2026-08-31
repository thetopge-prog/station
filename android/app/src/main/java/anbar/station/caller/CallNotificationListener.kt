package anbar.station.caller

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * مكالمات واتساب — الطريق الوحيد إليها.
 *
 * مكالمة واتساب لا تمرّ بنظام الهاتف في أندرويد إطلاقاً، فلا يراها مُستقبِل
 * حالة الهاتف مهما مُنح من أذونات. لكنها تُصدر إشعاراً، والإشعار نقرؤه.
 *
 * وهذا يشمل إشعار الرنين العادي أيضاً: على هذا الجهاز يصدره
 * com.samsung.android.incallui لا تطبيق «الهاتف» — وهي حقيقة كلّفتنا ساعة حين
 * كنّا نُعدّ ماكرودرويد. هنا لا نختار تطبيقاً بالاسم: نقبل أي إشعار من فئة
 * «مكالمة» ونترك الخادم يقرر إن كان فيه رقم.
 */
class CallNotificationListener : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return
    if (!interesting(pkg)) return

    val x = sbn.notification?.extras ?: return
    val title = x.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
    val text = x.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    if (title.isEmpty() && text.isEmpty()) return

    // Only a ringing/ongoing CALL is interesting. A chat message from the same
    // app is not, and would otherwise put every WhatsApp conversation on the
    // shop's till screen.
    val isCall = sbn.notification?.category == Notification.CATEGORY_CALL ||
      looksLikeCall(title) || looksLikeCall(text)
    if (!isCall) return

    val body = JSONObject()
      .put("secret", prefs(this).getString(SECRET_KEY, "") ?: "")
      // The server digs an Iraqi number out of ANY string it receives, so both
      // lines go as they are. A contact saved on the phone arrives as a name
      // and no number — `name` is what puts it on the till anyway.
      .put("t", title)
      .put("x", text)
      .put("name", title)

    val ctx = this
    val label = "إشعار · ${short(pkg)}"
    Thread { post(ctx, body, label) }.start()
  }

  /** تطبيقات المكالمات وحدها — لا كل ما يُشعر على الهاتف. */
  private fun interesting(pkg: String): Boolean =
    pkg.contains("whatsapp") ||
      pkg.contains("incallui") ||
      pkg.contains("dialer") ||
      pkg.contains("telecom") ||
      pkg.contains("viber") ||
      pkg.contains("messenger")

  private fun looksLikeCall(s: String): Boolean {
    val t = s.lowercase()
    return t.contains("call") || s.contains("مكالمة") || s.contains("اتصال") || s.contains("يتصل")
  }

  private fun short(pkg: String) = pkg.substringAfterLast('.')
}
