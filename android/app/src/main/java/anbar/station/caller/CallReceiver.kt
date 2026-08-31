package anbar.station.caller

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.CallLog
import android.telephony.TelephonyManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * حين يرنّ الهاتف — يُرسل الرقم.
 *
 * كُتب هذا التطبيق لأن ماكرودرويد أخفق ولم يكن في يدنا ما نقرؤه: صندوق مغلق،
 * وكل محاولة إصلاح تخمين. وقد ثبت بالقياس على هذا الجهاز بعينه أن أندرويد
 * **يعطي** الرقم لتطبيق يملك READ_CALL_LOG — سجل ماكرودرويد نفسه كان يعرضه —
 * وأن العطل كان في استبدال ماكرودرويد للنصّ لا في المنصّة.
 *
 * فالطريق مفتوح، وهذه أقصر مسافة فيه.
 */
class CallReceiver : BroadcastReceiver() {

  override fun onReceive(ctx: Context, intent: Intent) {
    val p = prefs(ctx)
    when (intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {

      TelephonyManager.EXTRA_STATE_RINGING -> {
        val n = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)?.trim()
        if (!n.isNullOrEmpty()) {
          send(ctx, n, "فوري")
        } else {
          // منذ أندرويد 10 يُرسَل هذا البثّ مرتين لمن يملك READ_CALL_LOG:
          // واحدة محجوبة وأخرى فيها الرقم. الفارغة ليست فشلاً — نسجّل وقت
          // الرنين فقط، ونترك التوأم الآخر أو السجل يكمل.
          p.edit().putLong(RING_AT, System.currentTimeMillis()).apply()
        }
      }

      TelephonyManager.EXTRA_STATE_IDLE -> {
        val ringAt = p.getLong(RING_AT, 0L)
        if (ringAt == 0L) return
        p.edit().remove(RING_AT).apply()

        // السجل يُكتب حين تنتهي المكالمة لا حين تبدأ. القراءة وقت الرنين تعيد
        // **المكالمة السابقة** — رقماً خاطئاً يبدو صحيحاً تماماً، وهو أسوأ ما
        // يمكن أن يفعله هذا التطبيق. فننتظر الإغلاق.
        val res = goAsync()
        Thread {
          try {
            Thread.sleep(3000)
            lastIncoming(ctx, ringAt - 60_000)?.let { send(ctx, it, "من السجل", async = false) }
          } catch (_: Throwable) {
          } finally {
            res.finish()
          }
        }.start()
      }
    }
  }

  /** أحدث مكالمة واردة/فائتة/مرفوضة بعد لحظة الرنين. */
  private fun lastIncoming(ctx: Context, since: Long): String? = try {
    ctx.contentResolver.query(
      CallLog.Calls.CONTENT_URI,
      arrayOf(CallLog.Calls.NUMBER),
      "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.TYPE} IN (?,?,?)",
      arrayOf(
        since.toString(),
        CallLog.Calls.INCOMING_TYPE.toString(),
        CallLog.Calls.MISSED_TYPE.toString(),
        CallLog.Calls.REJECTED_TYPE.toString(),
      ),
      "${CallLog.Calls.DATE} DESC",
    )?.use { if (it.moveToFirst()) it.getString(0)?.trim().orEmpty().ifEmpty { null } else null }
  } catch (_: Throwable) {
    null // لا إذن، أو مُزوّد غير متاح — الصمت أفضل من التعطّل
  }
}

// ── ما يشترك فيه المستقبِل ومستمع الإشعارات ─────────────────────────────────

const val PREFS = "station"
const val URL_KEY = "url"
const val SECRET_KEY = "secret"
const val STATUS = "status"
const val STATUS_AT = "status_at"
private const val RING_AT = "ring_at"
private const val LAST_NUM = "last_num"
private const val LAST_AT = "last_at"

fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

/**
 * يرسل رقماً مرة واحدة، ويكتب النتيجة حيث يراها صاحب المحل.
 *
 * بلا طابور ولا إعادة محاولة: «من يتصل الآن» بعد عشرين دقيقة ليس معلومة بل
 * ضجيج — الزبون أغلق والكاشير سأله عن عنوانه بنفسه. المحاولة الثانية الوحيدة
 * هي مسار السجل بعد إغلاق المكالمة، وهو ما زال نافعاً.
 * ponytail: طلقة واحدة. أضِف طابوراً فقط إن أراد المحل سجل مكالمات على الهاتف.
 */
fun send(ctx: Context, numberRaw: String, how: String, async: Boolean = true) {
  val p = prefs(ctx)
  val number = numberRaw.trim()
  val now = System.currentTimeMillis()

  // البثّ المزدوج في أندرويد 10+ يعني أن نفس الرقم قد يصل مرتين في ثانية.
  // نافذة دقيقة تبتلع التكرار، وتبتلع معها مكالمة ثانية حقيقية من نفس الرقم
  // خلالها — وهذه مقايضة مقبولة.
  if (number == p.getString(LAST_NUM, "") && now - p.getLong(LAST_AT, 0L) < 60_000) return
  p.edit().putString(LAST_NUM, number).putLong(LAST_AT, now).apply()

  val body = JSONObject().put("phone", number).put("secret", p.getString(SECRET_KEY, "") ?: "")
  if (async) Thread { post(ctx, body, "$number · $how") }.start()
  else post(ctx, body, "$number · $how")
}

/**
 * كلمة السر تُرسَل في الترويسة **وفي النصّ** معاً.
 *
 * الخادم يقبل الاثنتين ويكتفي بأيّهما طابق. سطر واحد يزيل صنفاً كاملاً من
 * الأعطال التي أضاعت علينا ليلة.
 */
fun post(ctx: Context, body: JSONObject, label: String) {
  val p = prefs(ctx)
  val url = (p.getString(URL_KEY, "") ?: "").trim()
  if (url.isEmpty()) return status(ctx, "$label · لا يوجد عنوان")

  var code = -1
  var note: String
  try {
    val c = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 8000
      readTimeout = 8000
      doOutput = true
      setRequestProperty("Content-Type", "application/json; charset=utf-8")
      setRequestProperty("x-station-secret", (p.getString(SECRET_KEY, "") ?: "").trim())
    }
    c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
    code = c.responseCode
    c.disconnect()
    note = when (code) {
      200 -> "وصل ✅"
      401 -> "كلمة السر لم تُرسل"
      403 -> "كلمة السر خاطئة"
      // ليس عطلاً: زبون أخفى رقمه. لو كُتبت «خطأ» لطارد صاحب المحل شبحاً.
      422 -> "الرقم محجوب"
      503 -> "النظام لم يُهيَّأ"
      else -> "الخادم ردّ $code"
    }
  } catch (e: Throwable) {
    note = e.javaClass.simpleName
  }
  status(ctx, "$label · $note" + if (code > 0) " ($code)" else "")
}

/** آخر ما جرى، بكلمات يقرأها صاحب المحل لا مبرمج. */
fun status(ctx: Context, text: String) {
  prefs(ctx).edit()
    .putString(STATUS, text)
    .putLong(STATUS_AT, System.currentTimeMillis())
    .apply()
}
