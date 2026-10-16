import { readFileSync } from 'fs';
import { join } from 'path';

import { colors, radii } from './tokens';

// The web app's design system is the source of truth. If someone changes a
// token in app/globals.css, this fails until mobile is updated to match.
const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf-8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('@theme'));

function cssVar(name: string): string | undefined {
  const match = rootBlock.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

const toKebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('theme tokens match app/globals.css', () => {
  it.each(Object.entries(colors))('colors.%s', (key, value) => {
    expect(cssVar(toKebab(key))?.toLowerCase()).toBe(value);
  });

  it.each(Object.entries(radii))('radii.%s', (key, value) => {
    expect(cssVar(`radius-${key}`)).toBe(`${value}px`);
  });
});
