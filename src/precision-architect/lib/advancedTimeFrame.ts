import type { AdvancedTimeFrameConfig } from '../types';

export function buildAdvancedTimeFramePayload(tf?: AdvancedTimeFrameConfig | null) {
  if (!tf || tf.mode === 'NONE') {
    return tf?.excludeWeekends ? { mode: 'NONE' as const, excludeWeekends: true } : { mode: 'NONE' as const };
  }

  return {
    mode: tf.mode,
    startHour: tf.startHour,
    endHour: tf.endHour,
    excludeWeekends: !!tf.excludeWeekends,
    ...(tf.profileName ? { profileName: tf.profileName } : {}),
  };
}
