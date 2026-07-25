import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN } from '../config';

/** SPEC §8.1: a muscle group's weekly effective sets should land in the 10-20 band. */
export function isVolumeInBand(count: number): boolean {
  return count >= VOLUME_TARGET_MIN && count <= VOLUME_TARGET_MAX;
}
