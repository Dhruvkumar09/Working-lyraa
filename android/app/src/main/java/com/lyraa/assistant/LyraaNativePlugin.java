package com.lyraa.assistant;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.view.KeyEvent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@CapacitorPlugin(name = "LyraaNative")
public class LyraaNativePlugin extends Plugin {

    /** Held so {@link MainActivity} can push an assist-gesture event into the web layer. */
    private static volatile LyraaNativePlugin live;

    private LyraaWakeWord wakeWord;
    private boolean wakeWordWanted = false;
    private String wakeWordPhrase = "Hey Lyraa";

    /** The orb is only wanted while Lyraa is off screen; see handleOnPause. */
    private boolean orbWanted = false;
    private String orbFrom = "#8b5cf6";
    private String orbTo = "#d946ef";
    private boolean orbAnimated = true;

    @Override
    public void load() {
        live = this;
    }

    @Override
    protected void handleOnDestroy() {
        stopWakeWordInternal();
        // Closing the window is not the same as turning the orb off, but it must
        // not be left hidden with no resume coming to bring it back.
        if (orbWanted) {
            LyraaOverlayService.setHidden(false);
        } else {
            stopOverlayInternal();
        }
        if (live == this) live = null;
    }

    static void notifyAssistLaunch() {
        LyraaNativePlugin plugin = live;
        if (plugin != null) {
            plugin.notifyListeners("assistLaunch", new JSObject());
        }
    }

    /** The orb was held down and put away, so the setting has to follow. */
    static void notifyOverlayDismissed() {
        LyraaNativePlugin plugin = live;
        if (plugin != null) {
            plugin.orbWanted = false;
            plugin.notifyListeners("overlayDismissed", new JSObject());
        }
    }

    private void ok(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    private void fail(PluginCall call, String error) {
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("error", error);
        call.resolve(result);
    }

    /** Every intent leaves the WebView, so NEW_TASK is required. */
    private void launch(PluginCall call, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            ok(call);
        } catch (Exception e) {
            fail(call, e.getMessage() == null ? "No app can handle that" : e.getMessage());
        }
    }

    private void launchSettings(PluginCall call, String action) {
        launch(call, new Intent(action));
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String pane = call.getString("pane", "main");
        String action;
        switch (pane == null ? "main" : pane) {
            case "wifi":
                action = Settings.ACTION_WIFI_SETTINGS;
                break;
            case "bluetooth":
                action = Settings.ACTION_BLUETOOTH_SETTINGS;
                break;
            case "battery":
                action = Intent.ACTION_POWER_USAGE_SUMMARY;
                break;
            case "apps":
                action = Settings.ACTION_APPLICATION_SETTINGS;
                break;
            case "sound":
                action = Settings.ACTION_SOUND_SETTINGS;
                break;
            case "display":
                action = Settings.ACTION_DISPLAY_SETTINGS;
                break;
            default:
                action = Settings.ACTION_SETTINGS;
        }
        launchSettings(call, action);
    }

    /** ACTION_DIAL only prefills; the user presses call. No CALL_PHONE permission. */
    @PluginMethod
    public void call(PluginCall call) {
        String number = call.getString("number", "");
        if (number == null || number.trim().isEmpty()) {
            fail(call, "No phone number given");
            return;
        }
        launch(call, new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null)));
    }

    /** ACTION_SENDTO drafts only; the user presses send. No SEND_SMS permission. */
    @PluginMethod
    public void sms(PluginCall call) {
        String number = call.getString("number", "");
        String text = call.getString("text", "");
        if (number == null || number.trim().isEmpty()) {
            fail(call, "No recipient given");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", number, null));
        intent.putExtra("sms_body", text == null ? "" : text);
        launch(call, intent);
    }

    @PluginMethod
    public void openCamera(PluginCall call) {
        launch(call, new Intent("android.media.action.STILL_IMAGE_CAMERA"));
    }

    @PluginMethod
    public void openGallery(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setType("image/*");
        launch(call, intent);
    }

    @PluginMethod
    public void calculator(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory("android.intent.category.APP_CALCULATOR");
        launch(call, intent);
    }

    @PluginMethod
    public void alarm(PluginCall call) {
        Integer hour = call.getInt("hour", 7);
        Integer minute = call.getInt("minute", 0);
        String label = call.getString("label", "");
        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
        intent.putExtra(AlarmClock.EXTRA_HOUR, hour == null ? 7 : hour);
        intent.putExtra(AlarmClock.EXTRA_MINUTES, minute == null ? 0 : minute);
        if (label != null && !label.isEmpty()) intent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        launch(call, intent);
    }

    @PluginMethod
    public void timer(PluginCall call) {
        Integer seconds = call.getInt("seconds", 60);
        Intent intent = new Intent(AlarmClock.ACTION_SET_TIMER);
        intent.putExtra(AlarmClock.EXTRA_LENGTH, seconds == null ? 60 : seconds);
        intent.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        launch(call, intent);
    }
    @PluginMethod
    public void media(PluginCall call) {
        String action = call.getString("action", "toggle");
        int keyCode;
        switch (action == null ? "toggle" : action) {
            case "play":
                keyCode = KeyEvent.KEYCODE_MEDIA_PLAY;
                break;
            case "pause":
                keyCode = KeyEvent.KEYCODE_MEDIA_PAUSE;
                break;
            case "next":
                keyCode = KeyEvent.KEYCODE_MEDIA_NEXT;
                break;
            case "previous":
                keyCode = KeyEvent.KEYCODE_MEDIA_PREVIOUS;
                break;
            default:
                keyCode = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        }
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            long now = android.os.SystemClock.uptimeMillis();
            audio.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0));
            audio.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0));
            ok(call);
        } catch (Exception e) {
            fail(call, e.getMessage() == null ? "Media key failed" : e.getMessage());
        }
    }

    @PluginMethod
    public void volume(PluginCall call) {
        String direction = call.getString("direction", "up");
        Integer steps = call.getInt("steps", 1);
        int count = Math.max(1, Math.min(10, steps == null ? 1 : steps));
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            String dir = direction == null ? "up" : direction;
            if ("mute".equals(dir) || "unmute".equals(dir)) {
                audio.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    "mute".equals(dir) ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE,
                    AudioManager.FLAG_SHOW_UI
                );
            } else {
                int adjust = "down".equals(dir) ? AudioManager.ADJUST_LOWER : AudioManager.ADJUST_RAISE;
                for (int i = 0; i < count; i++) {
                    audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, adjust, AudioManager.FLAG_SHOW_UI);
                }
            }
            ok(call);
        } catch (Exception e) {
            fail(call, e.getMessage() == null ? "Volume change failed" : e.getMessage());
        }
    }

    @PluginMethod
    public void flashlight(PluginCall call) {
        Boolean on = call.getBoolean("on", Boolean.TRUE);
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String torchId = null;
            for (String id : manager.getCameraIdList()) {
                Boolean hasFlash = manager.getCameraCharacteristics(id)
                    .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(hasFlash)) {
                    torchId = id;
                    break;
                }
            }
            if (torchId == null) {
                fail(call, "This device has no flashlight");
                return;
            }
            manager.setTorchMode(torchId, Boolean.TRUE.equals(on));
            ok(call);
        } catch (Exception e) {
            fail(call, e.getMessage() == null ? "Flashlight unavailable" : e.getMessage());
        }
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        String pkg = getContext().getPackageName();
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (power != null && power.isIgnoringBatteryOptimizations(pkg)) {
            ok(call);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + pkg));
        launch(call, intent);
    }

    /**
     * Autostart lives in a different OEM activity on every skin, so try the known
     * ones in order and fall back to this app's settings page.
     */
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        String[][] candidates = {
            { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
            { "com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity" },
            { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
            { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
            { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
            { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
        };
        for (String[] candidate : candidates) {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(candidate[0], candidate[1]));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (getContext().getPackageManager().resolveActivity(intent, 0) != null) {
                launch(call, intent);
                return;
            }
        }
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
        launch(call, fallback);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        launch(call, intent);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        launchSettings(call, Settings.ACTION_ACCESSIBILITY_SETTINGS);
    }

    /**
     * The only honest answer is whether the service is actually bound right now.
     * {@code enabled} tracks the system setting, which can be on while the service
     * is still starting; {@code value} is what callers should gate actions on.
     */
    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", LyraaAccessibilityService.isRunning());
        result.put("enabled", enabledInSettings());
        call.resolve(result);
    }

    private boolean enabledInSettings() {
        try {
            String enabled = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            return enabled != null && enabled.contains(getContext().getPackageName()
                + "/" + LyraaAccessibilityService.class.getName());
        } catch (Exception e) {
            return false;
        }
    }

    // ---- Screen control -----------------------------------------------------

    /** Null means the service is not bound; the call has already been failed. */
    private LyraaAccessibilityService reach(PluginCall call) {
        LyraaAccessibilityService service = LyraaAccessibilityService.get();
        if (service == null) {
            fail(call, "Screen control is off. Turn Lyraa on under Accessibility first.");
        }
        return service;
    }

    private LyraaAccessibilityService.Result answer(PluginCall call) {
        return (success, error) -> {
            if (success) {
                ok(call);
            } else {
                fail(call, error == null ? "That did not go through" : error);
            }
        };
    }

    private double coord(PluginCall call, String name) {
        Double value = call.getDouble(name);
        return value == null ? -1d : value;
    }

    @PluginMethod
    public void gestureTap(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        service.tap(coord(call, "x"), coord(call, "y"), answer(call));
    }

    @PluginMethod
    public void gestureLongPress(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        service.longPress(coord(call, "x"), coord(call, "y"), answer(call));
    }

    @PluginMethod
    public void gestureSwipe(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        Integer duration = call.getInt("duration", 260);
        service.swipe(
            coord(call, "x1"), coord(call, "y1"),
            coord(call, "x2"), coord(call, "y2"),
            duration == null ? 260 : duration,
            answer(call)
        );
    }

    @PluginMethod
    public void gestureScroll(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        String direction = call.getString("direction", "down");
        service.scroll(direction == null ? "down" : direction, answer(call));
    }

    /** back, home, recents, notifications, quickSettings, lockScreen. */
    @PluginMethod
    public void globalAction(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        String action = call.getString("action", "back");
        service.globalAction(action == null ? "back" : action, answer(call));
    }

    @PluginMethod
    public void clickText(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        String label = call.getString("label", "");
        if (label == null || label.trim().isEmpty()) {
            fail(call, "I need to know what to tap");
            return;
        }
        Boolean longPress = call.getBoolean("longPress", Boolean.FALSE);
        service.clickText(label.trim(), Boolean.TRUE.equals(longPress), answer(call));
    }

    @PluginMethod
    public void typeText(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        String text = call.getString("text", "");
        if (text == null) {
            fail(call, "There was no text to type");
            return;
        }
        Boolean append = call.getBoolean("append", Boolean.FALSE);
        service.typeText(text, Boolean.TRUE.equals(append), answer(call));
    }

    @PluginMethod
    public void readScreen(PluginCall call) {
        LyraaAccessibilityService service = reach(call);
        if (service == null) return;
        service.readScreen((JSONObject value, String error) -> {
            if (value == null) {
                fail(call, error == null ? "I could not read the screen" : error);
                return;
            }
            try {
                JSObject result = JSObject.fromJSONObject(value);
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception e) {
                fail(call, "I could not make sense of the screen");
            }
        });
    }

    @PluginMethod
    public void currentApp(PluginCall call) {
        LyraaAccessibilityService service = LyraaAccessibilityService.get();
        JSObject result = new JSObject();
        result.put("ok", true);
        String pkg = service == null ? null : service.currentPackage();
        result.put("package", pkg == null ? "" : pkg);
        result.put("label", pkg == null ? "" : labelFor(pkg));
        call.resolve(result);
    }

    // ---- Apps ---------------------------------------------------------------

    private List<ResolveInfo> launchableApps() {
        Intent probe = new Intent(Intent.ACTION_MAIN);
        probe.addCategory(Intent.CATEGORY_LAUNCHER);
        return getContext().getPackageManager().queryIntentActivities(probe, 0);
    }

    private String labelFor(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            List<ResolveInfo> found = launchableApps();
            List<JSObject> apps = new ArrayList<>();
            for (ResolveInfo info : found) {
                if (info.activityInfo == null) continue;
                String pkg = info.activityInfo.packageName;
                if (pkg.equals(getContext().getPackageName())) continue;
                JSObject app = new JSObject();
                app.put("package", pkg);
                app.put("label", info.loadLabel(pm).toString());
                apps.add(app);
            }
            apps.sort(Comparator.comparing(a -> a.getString("label", "").toLowerCase()));
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("apps", new JSArray(apps));
            call.resolve(result);
        } catch (Exception e) {
            fail(call, "I could not read the app list");
        }
    }

    /**
     * Accepts a package name or a spoken app name. Name matching prefers an exact
     * label, then a prefix, then a substring — so "whats" finds WhatsApp without
     * "app" matching every app on the phone.
     */
    @PluginMethod
    public void openApp(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String pkg = call.getString("package", "");
        String name = call.getString("name", "");

        if (pkg != null && !pkg.trim().isEmpty()) {
            Intent direct = pm.getLaunchIntentForPackage(pkg.trim());
            if (direct == null) {
                fail(call, "That app is not installed");
                return;
            }
            launch(call, direct);
            return;
        }

        if (name == null || name.trim().isEmpty()) {
            fail(call, "I need to know which app to open");
            return;
        }

        String wanted = name.trim().toLowerCase();
        String exact = null, prefix = null, contains = null;
        for (ResolveInfo info : launchableApps()) {
            if (info.activityInfo == null) continue;
            String label = info.loadLabel(pm).toString().toLowerCase();
            String candidate = info.activityInfo.packageName;
            if (candidate.equals(getContext().getPackageName())) continue;
            if (label.equals(wanted)) { exact = candidate; break; }
            if (prefix == null && label.startsWith(wanted)) prefix = candidate;
            if (contains == null && label.contains(wanted)) contains = candidate;
        }
        String chosen = exact != null ? exact : prefix != null ? prefix : contains;
        if (chosen == null) {
            fail(call, "I could not find an app called " + name.trim());
            return;
        }
        Intent intent = pm.getLaunchIntentForPackage(chosen);
        if (intent == null) {
            fail(call, "I found " + labelFor(chosen) + " but it has no way to open");
            return;
        }
        launch(call, intent);
    }

    /** Websites, YouTube, Maps, search — https only, so nothing odd can be dialled. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.trim().isEmpty()) {
            fail(call, "There was no address to open");
            return;
        }
        String target = url.trim();
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            target = "https://" + target;
        }
        Uri uri = Uri.parse(target);
        String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            fail(call, "I can only open web addresses that way");
            return;
        }
        launch(call, new Intent(Intent.ACTION_VIEW, uri));
    }

    // ---- Assistant role -----------------------------------------------------

    /**
     * Reads the system setting back rather than assuming. {@code isLyraa} is the
     * only field worth trusting — an empty string means no assistant is set.
     */
    @PluginMethod
    public void getDefaultAssistant(PluginCall call) {
        String current = "";
        try {
            String value = Settings.Secure.getString(getContext().getContentResolver(), "assistant");
            if (value == null || value.isEmpty()) {
                value = Settings.Secure.getString(
                    getContext().getContentResolver(), "voice_interaction_service");
            }
            if (value != null) current = value;
        } catch (Exception ignored) {
            // Some skins block reads; fall through to "unknown".
        }
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("component", current);
        result.put("isLyraa", current.contains(getContext().getPackageName()));
        call.resolve(result);
    }

    /**
     * Android has no API to request the assistant role, so the best available move
     * is landing Dhruv on the exact page and verifying afterwards.
     */
    @PluginMethod
    public void openAssistantSettings(PluginCall call) {
        Intent direct = new Intent(Intent.ACTION_MAIN);
        direct.setComponent(new ComponentName(
            "com.android.settings", "com.android.settings.Settings$ManageAssistActivity"));
        direct.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (getContext().getPackageManager().resolveActivity(direct, 0) != null) {
            launch(call, direct);
            return;
        }
        Intent voiceInput = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
        if (getContext().getPackageManager().resolveActivity(voiceInput, 0) != null) {
            launch(call, voiceInput);
            return;
        }
        launchSettings(call, Settings.ACTION_SETTINGS);
    }

    /** True once per assist gesture, so the web layer opens one conversation. */
    @PluginMethod
    public void consumeAssistLaunch(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("value", MainActivity.consumeAssistLaunch());
        call.resolve(result);
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), VoiceService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            ok(call);
        } catch (Exception e) {
            fail(call, e.getMessage() == null ? "Could not start the service" : e.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), VoiceService.class));
        } catch (Exception ignored) {
            // Service was not running.
        }
        ok(call);
    }

    // ---- Wake word ---------------------------------------------------------

    /**
     * Only ever runs while the app is open and no session holds the microphone.
     * Android reserves true always-on hotwords for the preloaded assistant, so
     * this is deliberately not advertised as such.
     */
    @PluginMethod
    public void startWakeWord(PluginCall call) {
        wakeWordPhrase = call.getString("phrase", "Hey Lyraa");
        wakeWordWanted = true;
        beginWakeWord();
        ok(call);
    }

    @PluginMethod
    public void stopWakeWord(PluginCall call) {
        wakeWordWanted = false;
        stopWakeWordInternal();
        ok(call);
    }

    @PluginMethod
    public void wakeWordSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("value", LyraaWakeWord.available(getContext()));
        call.resolve(result);
    }

    private void beginWakeWord() {
        stopWakeWordInternal();
        if (!wakeWordWanted) return;
        wakeWord = new LyraaWakeWord(getContext(), wakeWordPhrase, new LyraaWakeWord.Callback() {
            @Override
            public void onHeard() {
                // A session is about to claim the microphone.
                wakeWordWanted = false;
                notifyListeners("wakeWord", new JSObject());
            }

            @Override
            public void onUnavailable(String reason) {
                wakeWordWanted = false;
                JSObject payload = new JSObject();
                payload.put("reason", reason);
                notifyListeners("wakeWordUnavailable", payload);
            }
        });
        wakeWord.start();
    }

    private void stopWakeWordInternal() {
        if (wakeWord != null) {
            wakeWord.stop();
            wakeWord = null;
        }
    }

    // ---- Floating orb ------------------------------------------------------

    /** The one thing Android really does allow to sit on top of other apps. */
    @PluginMethod
    public void overlayPermitted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("value", Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void overlayRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("value", LyraaOverlayService.isRunning());
        call.resolve(result);
    }

    /**
     * Started from the foreground, because Android 12+ refuses to let a
     * background app start a foreground service. It then waits, hidden, until
     * Dhruv leaves Lyraa: an orb over her own UI is just in the way.
     */
    @PluginMethod
    public void startOverlay(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            fail(call, "Display over other apps is off for Lyraa");
            return;
        }
        orbFrom = call.getString("accentFrom", orbFrom);
        orbTo = call.getString("accentTo", orbTo);
        orbAnimated = Boolean.TRUE.equals(call.getBoolean("animated", true));
        orbWanted = true;
        try {
            Intent intent = overlayIntent();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            ok(call);
        } catch (Exception e) {
            orbWanted = false;
            fail(call, e.getMessage() == null ? "Could not show the orb" : e.getMessage());
        }
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        orbWanted = false;
        stopOverlayInternal();
        ok(call);
    }

    private Intent overlayIntent() {
        Intent intent = new Intent(getContext(), LyraaOverlayService.class);
        intent.putExtra(LyraaOverlayService.EXTRA_ACCENT_FROM, orbFrom);
        intent.putExtra(LyraaOverlayService.EXTRA_ACCENT_TO, orbTo);
        intent.putExtra(LyraaOverlayService.EXTRA_ANIMATED, orbAnimated);
        intent.putExtra(LyraaOverlayService.EXTRA_HIDDEN, true);
        return intent;
    }

    private void stopOverlayInternal() {
        try {
            getContext().stopService(new Intent(getContext(), LyraaOverlayService.class));
        } catch (Exception ignored) {
            // Not running.
        }
    }

    @PluginMethod
    public void setStatusBarStyle(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            ok(call);
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                androidx.core.view.WindowInsetsControllerCompat controller =
                    androidx.core.view.WindowCompat.getInsetsController(
                        activity.getWindow(), activity.getWindow().getDecorView());
                controller.setAppearanceLightStatusBars("DARK".equals(call.getString("style", "LIGHT")));
            } catch (Exception ignored) {
                // Cosmetic only.
            }
        });
        ok(call);
    }

    @Override
    protected void handleOnResume() {
        // The recogniser is released whenever Lyraa leaves the screen, so it has to
        // be picked back up here rather than left running in the background.
        beginWakeWord();
        LyraaOverlayService.setHidden(true);
        notifyListeners("appInForeground", new JSObject());
    }

    @Override
    protected void handleOnPause() {
        stopWakeWordInternal();
        // Now that Lyraa is off screen the orb has somewhere useful to be.
        LyraaOverlayService.setHidden(false);
        notifyListeners("appInBackground", new JSObject());
    }
}
