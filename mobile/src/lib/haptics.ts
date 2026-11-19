import * as Haptics from 'expo-haptics';

// Haptics are a nicety: a phone that can't play one (or has them off) must
// never break the tap that asked for it, so every call swallows its failure.
function quiet(run: () => Promise<void>) {
  try {
    void Promise.resolve(run()).catch(() => {});
  } catch {
    // Nothing to do: the tap still works without the buzz.
  }
}

/** The app's few haptic moments. Everything else stays silent so these keep their meaning. */
export const haptic = {
  /** Switching footer tabs, picking a calendar day. */
  tick: () => quiet(() => Haptics.selectionAsync()),
  /** Tapping the Check in button. */
  tap: () => quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A check-in QR code was recognised. */
  scan: () => quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** The check-in went through. */
  success: () => quiet(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Wrong QR code, or the check-in was rejected. */
  error: () => quiet(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
