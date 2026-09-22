/**
 * Tactile micro-interactions (PRD Phase 1.3) — thin guarded wrapper around
 * expo-haptics. No-ops on web and swallows runtime errors so a haptics
 * failure can never break an interaction.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light tap — file selection, tab switch, palette pick. */
export function tapLight(): void {
  if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Medium tap — meaningful actions (save, commands, approve). */
export function tapMedium(): void {
  if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

/** Success buzz — save applied, agent edit approved, connection test ok. */
export function notifySuccess(): void {
  if (enabled)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
}

/** Warning buzz — rejection, destructive action, failed test. */
export function notifyWarning(): void {
  if (enabled)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => undefined,
    );
}
