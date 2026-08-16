package com.lyraa.assistant;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.List;

/**
 * On-screen actions for Lyraa: gestures, navigation, typing and reading the
 * current UI.
 *
 * Everything here runs through the public AccessibilityService API and only
 * while Dhruv has switched the service on in Android Settings. Nothing bypasses
 * a lock screen, a password field or any other protected surface — password
 * nodes are skipped entirely when reading the screen, and the platform refuses
 * gestures over secure windows on its own.
 */
public class LyraaAccessibilityService extends AccessibilityService {

    /** Gesture dispatch is asynchronous, so results come back through this. */
    public interface Result {
        void done(boolean ok, String error);
    }

    public interface Payload {
        void done(JSONObject value, String error);
    }

    private static final int MAX_NODES = 90;
    private static final int MAX_TEXT = 2400;

    private static volatile LyraaAccessibilityService instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile String foregroundPackage = null;

    public static boolean isRunning() {
        return instance != null;
    }

    public static LyraaAccessibilityService get() {
        return instance;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            CharSequence pkg = event.getPackageName();
            if (pkg != null) foregroundPackage = pkg.toString();
        }
    }

    @Override
    public void onInterrupt() {
        // Nothing queued that needs cancelling.
    }

    // ---------------------------------------------------------------- gestures

    /** Coordinates at or below 1.0 are treated as a fraction of the screen. */
    private float toPixels(double value, int extent) {
        double scaled = value <= 1.0 ? value * extent : value;
        return (float) Math.max(1, Math.min(extent - 1, scaled));
    }

    public void tap(double x, double y, Result cb) {
        main.post(() -> {
            DisplayMetrics m = getResources().getDisplayMetrics();
            Path path = new Path();
            path.moveTo(toPixels(x, m.widthPixels), toPixels(y, m.heightPixels));
            dispatch(path, 60, cb);
        });
    }

    public void longPress(double x, double y, Result cb) {
        main.post(() -> {
            DisplayMetrics m = getResources().getDisplayMetrics();
            Path path = new Path();
            path.moveTo(toPixels(x, m.widthPixels), toPixels(y, m.heightPixels));
            dispatch(path, 650, cb);
        });
    }

    public void swipe(double x1, double y1, double x2, double y2, long durationMs, Result cb) {
        main.post(() -> {
            DisplayMetrics m = getResources().getDisplayMetrics();
            Path path = new Path();
            path.moveTo(toPixels(x1, m.widthPixels), toPixels(y1, m.heightPixels));
            path.lineTo(toPixels(x2, m.widthPixels), toPixels(y2, m.heightPixels));
            dispatch(path, Math.max(40, Math.min(3000, durationMs)), cb);
        });
    }

    private void dispatch(Path path, long durationMs, Result cb) {
        try {
            GestureDescription gesture = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(path, 0, durationMs))
                .build();

            boolean queued = dispatchGesture(gesture, new GestureResultCallback() {
                @Override
                public void onCompleted(GestureDescription description) {
                    cb.done(true, null);
                }

                @Override
                public void onCancelled(GestureDescription description) {
                    cb.done(false, "Android cancelled that gesture");
                }
            }, main);

            if (!queued) cb.done(false, "Android refused that gesture");
        } catch (Exception e) {
            cb.done(false, e.getMessage() == null ? "Gesture failed" : e.getMessage());
        }
    }

    /**
     * Scrolling through the focused scrollable node is far more reliable than a
     * blind swipe, so try that first and only fall back to a gesture.
     */
    public void scroll(String direction, Result cb) {
        main.post(() -> {
            boolean backward = "up".equals(direction) || "backward".equals(direction);
            AccessibilityNodeInfo root = getRootInActiveWindow();
            AccessibilityNodeInfo scrollable = root == null ? null : findScrollable(root);

            if (scrollable != null) {
                int action = backward
                    ? AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                    : AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
                boolean ok = scrollable.performAction(action);
                scrollable.recycle();
                if (ok) {
                    cb.done(true, null);
                    return;
                }
            }

            DisplayMetrics m = getResources().getDisplayMetrics();
            float cx = m.widthPixels / 2f;
            float from = backward ? m.heightPixels * 0.32f : m.heightPixels * 0.70f;
            float to = backward ? m.heightPixels * 0.74f : m.heightPixels * 0.28f;
            Path path = new Path();
            path.moveTo(cx, from);
            path.lineTo(cx, to);
            dispatch(path, 300, cb);
        });
    }

    // ------------------------------------------------------------ global nav

    public void globalAction(String name, Result cb) {
        main.post(() -> {
            int action;
            switch (name == null ? "back" : name) {
                case "home":
                    action = GLOBAL_ACTION_HOME;
                    break;
                case "recents":
                    action = GLOBAL_ACTION_RECENTS;
                    break;
                case "notifications":
                    action = GLOBAL_ACTION_NOTIFICATIONS;
                    break;
                case "quickSettings":
                    action = GLOBAL_ACTION_QUICK_SETTINGS;
                    break;
                case "lockScreen":
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
                        cb.done(false, "Locking the screen needs Android 9 or newer");
                        return;
                    }
                    action = GLOBAL_ACTION_LOCK_SCREEN;
                    break;
                default:
                    action = GLOBAL_ACTION_BACK;
            }
            boolean ok = performGlobalAction(action);
            cb.done(ok, ok ? null : "Android refused that navigation action");
        });
    }

    // ---------------------------------------------------------------- typing

    /**
     * Writes into whatever field currently holds input focus. ACTION_SET_TEXT
     * replaces the field contents, so appending reads the existing value first.
     */
    public void typeText(String text, boolean append, Result cb) {
        main.post(() -> {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) {
                cb.done(false, "I cannot see the screen right now");
                return;
            }

            AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (target == null) target = findEditable(root);
            if (target == null) {
                cb.done(false, "No text field is focused. Tap one first");
                return;
            }
            if (target.isPassword()) {
                cb.done(false, "I will not type into a password field");
                target.recycle();
                return;
            }

            CharSequence existing = append ? target.getText() : null;
            String value = existing == null ? text : existing + text;

            Bundle args = new Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
            boolean ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            target.recycle();

            cb.done(ok, ok ? null : "That field would not accept text");
        });
    }

    // -------------------------------------------------------- click by label

    /**
     * Finds a control by its visible label or content description and clicks it.
     * Falls back to tapping the centre of its bounds when the node itself is not
     * directly clickable.
     */
    public void clickText(String label, boolean longPress, Result cb) {
        main.post(() -> {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) {
                cb.done(false, "I cannot see the screen right now");
                return;
            }

            AccessibilityNodeInfo match = findByLabel(root, label);
            if (match == null) {
                cb.done(false, "I could not find \"" + label + "\" on screen");
                return;
            }

            AccessibilityNodeInfo actionable = match;
            while (actionable != null && !(longPress ? actionable.isLongClickable() : actionable.isClickable())) {
                actionable = actionable.getParent();
            }

            if (actionable != null) {
                int action = longPress
                    ? AccessibilityNodeInfo.ACTION_LONG_CLICK
                    : AccessibilityNodeInfo.ACTION_CLICK;
                if (actionable.performAction(action)) {
                    cb.done(true, null);
                    return;
                }
            }

            Rect bounds = new Rect();
            match.getBoundsInScreen(bounds);
            if (bounds.isEmpty()) {
                cb.done(false, "\"" + label + "\" is on screen but cannot be tapped");
                return;
            }
            Path path = new Path();
            path.moveTo(bounds.centerX(), bounds.centerY());
            dispatch(path, longPress ? 650 : 60, cb);
        });
    }

    // ----------------------------------------------------------- screen read

    /**
     * A bounded snapshot of the current screen: the foreground package plus the
     * visible labels and fields, capped so a busy screen cannot flood the model.
     * Password fields are never included.
     */
    public void readScreen(Payload cb) {
        main.post(() -> {
            JSONObject out = new JSONObject();
            try {
                AccessibilityNodeInfo root = getRootInActiveWindow();
                String pkg = root != null && root.getPackageName() != null
                    ? root.getPackageName().toString()
                    : foregroundPackage;
                out.put("app", pkg == null ? "unknown" : pkg);

                if (root == null) {
                    out.put("elements", new JSONArray());
                    out.put("truncated", false);
                    out.put("note", "The current screen does not expose its contents");
                    cb.done(out, null);
                    return;
                }

                JSONArray elements = new JSONArray();
                int textBudget = MAX_TEXT;
                boolean truncated = false;

                ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
                queue.add(root);

                while (!queue.isEmpty()) {
                    AccessibilityNodeInfo node = queue.poll();
                    if (node == null) continue;

                    if (elements.length() >= MAX_NODES || textBudget <= 0) {
                        truncated = true;
                        break;
                    }

                    if (!node.isPassword() && node.isVisibleToUser()) {
                        CharSequence raw = node.getText() != null ? node.getText() : node.getContentDescription();
                        String label = raw == null ? null : raw.toString().trim();
                        if (label != null && !label.isEmpty()) {
                            String clipped = label.length() > 160 ? label.substring(0, 160) : label;
                            JSONObject element = new JSONObject();
                            element.put("label", clipped);
                            if (node.isEditable()) element.put("editable", true);
                            if (node.isClickable()) element.put("clickable", true);
                            if (node.isScrollable()) element.put("scrollable", true);
                            if (node.isChecked()) element.put("checked", true);
                            elements.put(element);
                            textBudget -= clipped.length();
                        }
                    }

                    for (int i = 0; i < node.getChildCount(); i++) {
                        AccessibilityNodeInfo child = node.getChild(i);
                        if (child != null) queue.add(child);
                    }
                }

                out.put("elements", elements);
                out.put("truncated", truncated);
                cb.done(out, null);
            } catch (Exception e) {
                cb.done(null, e.getMessage() == null ? "Could not read the screen" : e.getMessage());
            }
        });
    }

    /** The package of whatever is in front, used to verify that a launch worked. */
    public String currentPackage() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null && root.getPackageName() != null) return root.getPackageName().toString();
        return foregroundPackage;
    }

    // ---------------------------------------------------------------- lookup

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo root) {
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.poll();
            if (node == null) continue;
            if (node.isScrollable() && node.isVisibleToUser()) return node;
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.add(child);
            }
        }
        return null;
    }

    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo root) {
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.poll();
            if (node == null) continue;
            if (node.isEditable() && node.isVisibleToUser() && !node.isPassword()) return node;
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.add(child);
            }
        }
        return null;
    }

    /**
     * Exact platform lookup first, then a case-insensitive contains pass over
     * text and content descriptions, because spoken labels rarely match the
     * on-screen string exactly.
     */
    private AccessibilityNodeInfo findByLabel(AccessibilityNodeInfo root, String label) {
        if (label == null || label.trim().isEmpty()) return null;
        String needle = label.trim().toLowerCase();

        List<AccessibilityNodeInfo> exact = root.findAccessibilityNodeInfosByText(label);
        if (exact != null) {
            for (AccessibilityNodeInfo node : exact) {
                if (node != null && node.isVisibleToUser()) return node;
            }
        }

        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.poll();
            if (node == null) continue;
            if (node.isVisibleToUser()) {
                if (matches(node.getText(), needle) || matches(node.getContentDescription(), needle)) return node;
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.add(child);
            }
        }
        return null;
    }

    private boolean matches(CharSequence value, String needle) {
        return value != null && value.toString().toLowerCase().contains(needle);
    }
}
