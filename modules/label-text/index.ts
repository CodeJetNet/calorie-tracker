import { requireNativeModule } from 'expo';
import type { Fragment } from '../../src/label/parse';

/** Text lines in a photo, found on the device. `rotation` turns the image clockwise first, in degrees (0, 90, 180, 270). */
export function recognize(uri: string, rotation = 0): Promise<Fragment[]> {
  return requireNativeModule('LabelText').recognize(uri, rotation);
}
