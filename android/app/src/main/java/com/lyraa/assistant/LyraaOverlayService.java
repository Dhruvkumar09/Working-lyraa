package com.lyraa.assistant;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * The floating orb: Lyraa reachable from on top of any other app.
 *
 * This is the one feature Android grants through an explicit user-granted
 * overlay permission rather than the assistant role, so it is real rather than
 * simulated: a window owned by this service, drawn over whatever is in front.
 *
 * Tapping it opens a conversation through the same path as the assist gesture.
 * Holding it puts it away. It hides itself whenever Lyraa is the app on screen,
 * because an orb floating over its own UI is just an obstruction.
 */
public class LyraaOverlayService extends Service {

    static final String EXTRA_ACCENT_FROM = "lyraa.accentFrom";
    static final String EXTRA_ACCENT_TO = "lyraa.accentTo";
    static final String EXTRA_ANIMATED = "lyraa.animated";
    /** Starting is always done from the foreground, where the orb would be in the way. */
    static final String EXTRA_HIDDEN = "lyraa.hidden";

    private static final String CHANNEL_ID = "lyraa_orb";
    private static final int NOTIFICATION_ID = 1002;

    private static final int HALO_DP = 74;
    private static final int CORE_DP = 54;
    /** Past this much movement the gesture is a drag, not a tap. */
    private static final float DRAG_SLOP_DP = 8f;
    private static final long HOLD_TO_DISMISS_MS = 550;
    private static final long SNAP_MS = 220;

    /** Same process as the plugin, so visibility is toggled directly. */
    private static volatile LyraaOverlayService live;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private WindowManager windows;
    private WindowManager.LayoutParams params;
    private FrameLayout root;
    private View halo;
    private ValueAnimator pulse;
    private SharedPreferences prefs;

    private float downRawX;
    private float downRawY;
    private int downX;
    private int downY;
    private boolean dragging;
    private boolean dismissed;
    private final Runnable holdToDismiss = this::dismiss;

    static boolean isRunning() {
        return live != null;
    }

    /** Called as Lyraa comes to the front and goes away again. */
    static void setHidden(boolean hidden) {
        LyraaOverlayService service = live;
        if (service == null) return;
        service.handler.post(() -> service.applyHidden(hidden));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences("lyraa.orb", Context.MODE_PRIVATE);
        windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Lyraa bubble", NotificationManager.IMPORTANCE_MIN);
            channel.setDescription("Shown while the floating orb is on screen.");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        goForeground();

        // The permission is revocable at any time, and drawing without it throws.
        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String from = intent == null ? null : intent.getStringExtra(EXTRA_ACCENT_FROM);
        String to = intent == null ? null : intent.getStringExtra(EXTRA_ACCENT_TO);
        boolean animated = intent == null || intent.getBooleanExtra(EXTRA_ANIMATED, true);
        boolean hidden = intent == null || intent.getBooleanExtra(EXTRA_HIDDEN, true);

        if (root == null) {
            attach(color(from, 0xFF8B5CF6), color(to, 0xFFD946EF), animated);
            applyHidden(hidden);
        } else {
            paint(color(from, 0xFF8B5CF6), color(to, 0xFFD946EF), animated);
        }
        live = this;
        return START_NOT_STICKY;
    }

    private void goForeground() {
        PendingIntent tap = PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Lyraa is one tap away")
            .setContentText("Tap the orb to talk. Hold it to put it away.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(tap)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // No media or location work here, so this is the type Android reserves
            // for a long-lived window the user asked for and can see.
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private int dp(float value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }

    private static int color(String hex, int fallback) {
        if (hex == null || hex.isEmpty()) return fallback;
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    private void attach(int from, int to, boolean animated) {
        int box = dp(HALO_DP);
        int core = dp(CORE_DP);

        root = new FrameLayout(this);

        halo = new View(this);
        FrameLayout.LayoutParams haloParams = new FrameLayout.LayoutParams(box, box);
        haloParams.gravity = Gravity.CENTER;
        root.addView(halo, haloParams);

        View coreView = new View(this);
        FrameLayout.LayoutParams coreParams = new FrameLayout.LayoutParams(core, core);
        coreParams.gravity = Gravity.CENTER;
        root.addView(coreView, coreParams);
        coreView.setElevation(dp(6));

        paint(from, to, animated);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        params = new WindowManager.LayoutParams(
            box,
            box,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        params.x = prefs.getInt("x", metrics.widthPixels - box);
        params.y = prefs.getInt("y", Math.round(metrics.heightPixels * 0.62f));
        clampIntoScreen();

        root.setOnTouchListener(this::onOrbTouch);

        try {
            windows.addView(root, params);
        } catch (Exception e) {
            // Permission pulled between the check and here, or no window manager.
            root = null;
            stopSelf();
        }
    }

    /** Kept separate from attach so an accent change does not rebuild the window. */
    private void paint(int from, int to, boolean animated) {
        if (root == null) return;

        GradientDrawable haloShape = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR, new int[] {from, to});
        haloShape.setShape(GradientDrawable.OVAL);
        halo.setBackground(haloShape);
        halo.setAlpha(0.28f);

        View coreView = root.getChildAt(1);
        GradientDrawable coreShape = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR, new int[] {from, to});
        coreShape.setShape(GradientDrawable.OVAL);
        coreShape.setStroke(dp(1.5f), 0x33FFFFFF);
        coreView.setBackground(coreShape);

        if (animated) startPulse(); else stopPulse();
    }

    /**
     * A slow breath so the orb reads as live rather than as a stuck screenshot.
     * Scale and alpha only, so it stays on the compositor.
     */
    private void startPulse() {
        if (pulse != null) return;
        pulse = ValueAnimator.ofFloat(0f, 1f);
        pulse.setDuration(2400);
        pulse.setRepeatCount(ValueAnimator.INFINITE);
        pulse.setRepeatMode(ValueAnimator.REVERSE);
        pulse.addUpdateListener(animation -> {
            float t = animation.getAnimatedFraction();
            float scale = 1f + 0.14f * t;
            halo.setScaleX(scale);
            halo.setScaleY(scale);
            halo.setAlpha(0.3f - 0.16f * t);
        });
        pulse.start();
    }

    private void stopPulse() {
        if (pulse != null) {
            pulse.cancel();
            pulse = null;
        }
        halo.setScaleX(1f);
        halo.setScaleY(1f);
        halo.setAlpha(0.28f);
    }

    private void applyHidden(boolean hidden) {
        if (root == null) return;
        root.setVisibility(hidden ? View.GONE : View.VISIBLE);
        if (hidden) stopPulse();
        else if (pulse == null) startPulse();
    }

    private boolean onOrbTouch(View view, MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                downX = params.x;
                downY = params.y;
                dragging = false;
                root.animate().scaleX(0.92f).scaleY(0.92f).setDuration(120).start();
                handler.postDelayed(holdToDismiss, HOLD_TO_DISMISS_MS);
                return true;

            case MotionEvent.ACTION_MOVE: {
                float dx = event.getRawX() - downRawX;
                float dy = event.getRawY() - downRawY;
                if (!dragging && Math.hypot(dx, dy) > dp(DRAG_SLOP_DP)) {
                    dragging = true;
                    handler.removeCallbacks(holdToDismiss);
                }
                if (dragging) {
                    params.x = downX + Math.round(dx);
                    params.y = downY + Math.round(dy);
                    clampIntoScreen();
                    try {
                        windows.updateViewLayout(root, params);
                    } catch (Exception ignored) {
                        // Window already gone.
                    }
                }
                return true;
            }

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                handler.removeCallbacks(holdToDismiss);
                root.animate().scaleX(1f).scaleY(1f).setDuration(140).start();
                if (dismissed) return true;
                if (dragging) {
                    snapToEdge();
                } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                    openConversation();
                }
                return true;

            default:
                return false;
        }
    }

    private void clampIntoScreen() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int maxX = Math.max(0, metrics.widthPixels - params.width);
        int maxY = Math.max(0, metrics.heightPixels - params.height);
        params.x = Math.min(Math.max(0, params.x), maxX);
        params.y = Math.min(Math.max(0, params.y), maxY);
    }

    /** Bubbles belong against an edge; anywhere else looks dropped by accident. */
    private void snapToEdge() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int target = params.x + params.width / 2 < metrics.widthPixels / 2
            ? 0
            : metrics.widthPixels - params.width;

        ValueAnimator slide = ValueAnimator.ofInt(params.x, target);
        slide.setDuration(SNAP_MS);
        slide.addUpdateListener(animation -> {
            if (root == null) return;
            params.x = (int) animation.getAnimatedValue();
            try {
                windows.updateViewLayout(root, params);
            } catch (Exception ignored) {
                // Window already gone.
            }
        });
        slide.start();

        prefs.edit().putInt("x", target).putInt("y", params.y).apply();
    }

    /**
     * Reuses the assist-gesture flag, so the orb and a long-press of the home
     * gesture land in exactly the same place with the same one-shot semantics.
     */
    private void openConversation() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra(MainActivity.EXTRA_FROM_ASSIST, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open Lyraa", Toast.LENGTH_SHORT).show();
        }
    }

    private void dismiss() {
        dismissed = true;
        buzz();
        Toast.makeText(this, "Orb hidden. Turn it back on in Settings.", Toast.LENGTH_SHORT).show();
        LyraaNativePlugin.notifyOverlayDismissed();
        stopSelf();
    }

    private void buzz() {
        try {
            Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(24, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(24);
            }
        } catch (Exception ignored) {
            // Haptics are a nicety.
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (pulse != null) {
            pulse.cancel();
            pulse = null;
        }
        if (root != null) {
            try {
                windows.removeView(root);
            } catch (Exception ignored) {
                // Already detached.
            }
            root = null;
        }
        if (live == this) live = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
