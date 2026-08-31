plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "anbar.station.caller"
  compileSdk = 34

  defaultConfig {
    applicationId = "anbar.station.caller"
    minSdk = 24
    // 33 on purpose, not 34: Android 14 makes foregroundServiceType mandatory
    // and tightens receiver export rules. This app has no service and no
    // exported receiver worth the churn, and it is sideloaded — Play's
    // target-API deadlines never apply to it.
    targetSdk = 33
    versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
    versionName = "1.0.$versionCode"
  }

  signingConfigs {
    create("shared") {
      // A fixed key checked into the repo. All it confers is "can build an APK
      // this phone accepts as an update", which still needs the handset in your
      // hand. The real secret is typed into the app on the phone and is never
      // built in. Without a FIXED key, every CI build is signed differently and
      // the phone refuses the update — the shop would have to uninstall, and
      // lose its URL and secret, on every release.
      storeFile = file("../station.keystore")
      storePassword = "station"
      keyAlias = "station"
      keyPassword = "station"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("shared")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

// Deliberately empty. No AndroidX, no Material, no OkHttp, no WorkManager.
// HttpURLConnection, org.json and SharedPreferences are all in the framework,
// the APK stays around 40KB, and a CI build has nothing to resolve and nothing
// to break.
dependencies {}
