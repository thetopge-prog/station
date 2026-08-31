package anbar.station.caller

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * شاشة واحدة: العنوان، وكلمة السر، وسطر يقول هل يعمل.
 *
 * سطر الحالة هو أهم ما فيها. تطبيق ميت لا يستطيع أن يبلّغ عن موته — الطريقة
 * الوحيدة لاكتشافه هي أن يرى صاحب المحل «آخر مكالمة: قبل ٣ أيام» بينما الهاتف
 * يرنّ كل يوم. فالوقت مكتوب دائماً، حتى حين يكون كل شيء سليماً.
 */
class MainActivity : Activity() {

  private lateinit var url: EditText
  private lateinit var secret: EditText
  private lateinit var status: TextView

  override fun onCreate(b: Bundle?) {
    super.onCreate(b)
    setContentView(R.layout.activity_main)
    url = findViewById(R.id.url)
    secret = findViewById(R.id.secret)
    status = findViewById(R.id.status)

    val p = prefs(this)
    url.setText(p.getString(URL_KEY, "https://station-anbar.netlify.app/api/calls"))
    secret.setText(p.getString(SECRET_KEY, ""))

    findViewById<Button>(R.id.save).setOnClickListener {
      p.edit()
        .putString(URL_KEY, url.text.toString().trim())
        .putString(SECRET_KEY, secret.text.toString().trim())
        .apply()
      Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show()
      ask()
    }

    /*
     * «فحص» يرسل كلمة السر بلا رقم.
     *
     * فيردّ الخادم 422 — وهو هنا النجاح: العنوان صحيح، وكلمة السر مقبولة،
     * والشبكة تعمل، ولم يُكتب شيء في قاعدة البيانات. أربعة تشخيصات من رقم
     * واحد، بلا كمبيوتر وبلا اتصال حقيقي.
     */
    findViewById<Button>(R.id.probe).setOnClickListener {
      p.edit()
        .putString(URL_KEY, url.text.toString().trim())
        .putString(SECRET_KEY, secret.text.toString().trim())
        .apply()
      Thread {
        post(this, JSONObject().put("secret", secret.text.toString().trim()), "فحص")
        runOnUiThread { show() }
      }.start()
    }

    findViewById<Button>(R.id.refresh).setOnClickListener { show() }

    // وصول الإشعارات إذن خاص لا يُمنح من نافذة عادية — يفتح صفحته في الإعدادات
    findViewById<Button>(R.id.wa).setOnClickListener {
      try {
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
      } catch (_: Throwable) {
        startActivity(Intent(Settings.ACTION_SETTINGS))
      }
    }

    ask()
  }

  override fun onResume() {
    super.onResume()
    show()
  }

  /** بلا هذين الإذنين لا يصل البثّ أصلاً، ولا يظهر رقم. */
  private fun ask() {
    val need = arrayOf(Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG)
      .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
  }

  private fun show() {
    val p = prefs(this)
    val s = p.getString(STATUS, null)
    status.text = if (s.isNullOrEmpty()) getString(R.string.never_yet) else "$s\n${ago(p.getLong(STATUS_AT, 0L))}"
  }

  /** «قبل ٣ أيام» هو التشخيص كله. */
  private fun ago(at: Long): String {
    if (at == 0L) return ""
    val m = (System.currentTimeMillis() - at) / 60000
    return when {
      m < 1L -> "الآن"
      m < 60L -> "قبل $m دقيقة"
      m < 1440L -> "قبل ${m / 60} ساعة"
      else -> "قبل ${m / 1440} يوم"
    }
  }
}
