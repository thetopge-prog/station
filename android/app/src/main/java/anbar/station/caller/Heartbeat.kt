package anbar.station.caller

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import org.json.JSONObject

/**
 * نبضة كل ربع ساعة: «الجهاز حيّ، وقراءة الشاشة مفعّلة/مطفأة».
 *
 * الكاشير كان يكتشف أن قراءة شاشة توترز انطفأت من طلبٍ لم يصل. الآن الخادم
 * يعرف آخر نبضة وحالة الإذنين، وشاشة الطلبات الواردة تقول «الجهاز صامت منذ
 * ٤٠ دقيقة» أو «قراءة الشاشة مطفأة» قبل أن يضيع طلب.
 *
 * JobScheduler من النظام نفسه: يصمد أمام إعادة التشغيل (setPersisted) بلا
 * مكتبة ولا خدمة أمامية. تُرسَل أيضاً فور تشغيل خدمة القراءة وفور إطفائها.
 */
object Heartbeat {
  private const val JOB_ID = 1001

  fun schedule(ctx: Context) {
    val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
    val job = JobInfo.Builder(JOB_ID, ComponentName(ctx, HeartbeatJob::class.java))
      .setPeriodic(15 * 60_000L)
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
      .setPersisted(true)
      .build()
    js.schedule(job)
  }

  /** الإذنان يُقرآن من إعدادات النظام لا من ذاكرتنا — الحقيقة كما يراها أندرويد. */
  fun accessibilityOn(ctx: Context): Boolean {
    val s = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
    return s.contains(ctx.packageName)
  }

  fun notificationsOn(ctx: Context): Boolean {
    val s = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: ""
    return s.contains(ctx.packageName)
  }

  fun send(ctx: Context) {
    val p = prefs(ctx)
    val body = JSONObject()
      .put("secret", p.getString(SECRET_KEY, "") ?: "")
      .put("ping", true)
      .put("device", "toters")
      .put("acc", accessibilityOn(ctx))
      .put("notif", notificationsOn(ctx))
      .put("ver", BuildConfig.VERSION_NAME)
    // بصمت: لا تمحو آخر ما جرى عن الشاشة — «شاشة توترز #١٢٣ · وصل» أنفع من «نبضة»
    post(ctx, body, "نبضة", quiet = true)
  }
}

class HeartbeatJob : JobService() {
  override fun onStartJob(params: JobParameters?): Boolean {
    Thread {
      try { Heartbeat.send(this) } catch (_: Throwable) {}
      jobFinished(params, false)
    }.start()
    return true
  }

  override fun onStopJob(params: JobParameters?): Boolean = false
}
