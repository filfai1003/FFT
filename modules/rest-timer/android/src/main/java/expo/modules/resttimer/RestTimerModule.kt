package expo.modules.resttimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The rest timer as an ongoing notification with a live countdown (DECISIONS 52). Android draws the
 * countdown itself (a chronometer counting down to `endsAt`), so it keeps ticking on the lock screen
 * and in the shade while the app sleeps. The sound at the end stays with expo-notifications.
 */
class RestTimerModule : Module() {
  private val channelId = "rest-timer-live"
  private val notificationId = 4207

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("RestTimer")

    Function("show") { endsAtMs: Double, title: String, body: String, channelName: String ->
      show(endsAtMs.toLong(), title, body, channelName)
    }

    Function("hide") {
      NotificationManagerCompat.from(context).cancel(notificationId)
    }
  }

  private fun show(endsAt: Long, title: String, body: String, channelName: String) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Quiet: it only shows the countdown; the alert at the end has its own channel.
      val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val tap = launch?.let {
      PendingIntent.getActivity(
        context,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val remaining = endsAt - System.currentTimeMillis()
    if (remaining <= 0) return
    val builder = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(body)
      .setWhen(endsAt)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      // Gone by itself when the rest is over, even if the app never runs again.
      .setTimeoutAfter(remaining + 1000)
    if (tap != null) builder.setContentIntent(tap)
    try {
      manager.notify(notificationId, builder.build())
    } catch (_: SecurityException) {
      // Notifications not allowed: the in-app timer still works.
    }
  }

  /** The monochrome notification icon of expo-notifications when there is one, else the app's. */
  private fun smallIcon(): Int {
    val res = context.resources
    val id = res.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }
}
