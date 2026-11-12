import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

export type ThemeChoice = 'light' | 'dark' | 'auto';

const KEY = 'theme';

/** The saved theme. Light until the user picks otherwise, as the app has always been. */
export function getThemeChoice(): ThemeChoice {
  try {
    const saved = SecureStore.getItem(KEY);
    return saved === 'dark' || saved === 'auto' ? saved : 'light';
  } catch {
    return 'light';
  }
}

/** Switches the app's appearance now ('auto' follows the phone) and remembers it. */
export function setThemeChoice(choice: ThemeChoice) {
  Appearance.setColorScheme(choice);
  try {
    SecureStore.setItem(KEY, choice);
  } catch {
    // The theme still applies for this session; it just won't be remembered.
  }
}

/** Applies the saved theme. Called once as the app starts, before anything draws. */
export function applySavedTheme() {
  Appearance.setColorScheme(getThemeChoice());
}
