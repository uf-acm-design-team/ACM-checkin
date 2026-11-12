import { DynamicColorIOS, Platform } from 'react-native';

import { darkColors } from './dark';
import { colors as lightColors, type ColorToken } from './tokens';

/**
 * Dark mode is iOS-only for now. iOS has colours that carry both a light and a
 * dark value and switch on their own when the app's appearance changes, so
 * every screen follows the theme without being rewritten. Android has no
 * equivalent without native resources, so it keeps the light palette.
 */
export const supportsDarkMode = Platform.OS === 'ios';

/**
 * The colours screens use. On iOS a token whose dark value differs is a
 * dynamic colour (typed as a string so call sites don't change): pass it
 * straight to a style or colour prop, never build strings from it.
 */
export const colors: Record<ColorToken, string> = supportsDarkMode
  ? (Object.fromEntries(
      (Object.keys(lightColors) as ColorToken[]).map((token) => [
        token,
        lightColors[token] === darkColors[token]
          ? lightColors[token]
          : DynamicColorIOS({ light: lightColors[token], dark: darkColors[token] }),
      ]),
    ) as Record<ColorToken, string>)
  : lightColors;

/**
 * The light palette, never adaptive. For the few things that must not flip:
 * a scrim behind a sheet, the black behind the camera, pale text on the accent.
 */
export { lightColors };
