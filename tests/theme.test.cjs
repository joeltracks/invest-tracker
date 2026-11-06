const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const landing = fs.readFileSync(path.join(root, 'src/landing.css'), 'utf8');
const paletteBlock = styles.match(/:root\s*\{([^}]+)\}/);
assert.ok(paletteBlock, 'The existing root theme must remain the source of truth.');
const definitions = [...paletteBlock[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
const tokens = Object.fromEntries(definitions.map(([, name, value]) => [name, value.trim()]));

function luminance(value) {
  assert.match(value, /^#[0-9a-f]{6}$/i, 'Contrast pairs must use opaque theme colors.');
  const channels = value.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(tokens[a]), luminance(tokens[b])].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test('body, financial states and button text retain AA contrast', () => {
  const pairs = [];
  for (const background of ['--surface', '--paper', '--surface-muted', '--surface-hover', '--soft-blue', '--soft-green', '--soft-orange', '--soft-warning']) {
    pairs.push(['--ink', background], ['--muted', background]);
  }
  pairs.push(['--blue', '--soft-blue'], ['--blue', '--surface'], ['--green', '--soft-green'],
    ['--green', '--surface'], ['--orange', '--soft-orange'], ['--danger', '--soft-danger'],
    ['--warning', '--soft-warning'], ['--placeholder', '--surface'], ['--inverse', '--ink']);
  for (const background of ['--blue', '--blue-hover', '--blue-active', '--danger']) pairs.push(['--on-primary', background]);
  for (const background of ['--nav-bg', '--nav-hover', '--nav-active']) pairs.push(['--nav-ink', background], ['--nav-muted', background]);
  for (const [foreground, background] of pairs) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
  }
});

test('focus rings and input boundaries meet non-text contrast requirements', () => {
  const pairs = [['--control-border', '--surface'], ['--control-border', '--paper'],
    ['--focus', '--surface'], ['--focus', '--paper'], ['--focus', '--soft-blue'],
    ['--nav-focus', '--nav-bg'], ['--nav-focus', '--nav-hover'], ['--nav-focus', '--nav-active']];
  for (const [foreground, background] of pairs) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 3, `${foreground} on ${background}: ${ratio.toFixed(2)}:1 (needs 3:1)`);
  }
});

test('component styles resolve every token and keep color literals in the root palette', () => {
  assert.equal(new Set(definitions.map(([, name]) => name)).size, definitions.length, 'Duplicate tokens obscure the theme source.');
  for (const reference of (styles + landing).matchAll(/var\(\s*(--[\w-]+)/g)) assert.ok(tokens[reference[1]], `Missing token ${reference[1]}`);
  for (const css of [styles.replace(paletteBlock[0], ''), landing]) assert.ok(!/#[a-f\d]{3,8}\b|rgba?\(/i.test(css), 'Components must use the shared color tokens.');
  const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /stopColor="var\(--blue\)"/);
  assert.ok(!/stopColor="#[a-f\d]/i.test(app));
});

test('the existing light-only mode and reduced-motion rules remain explicit', () => {
  assert.match(paletteBlock[1], /color-scheme:\s*light/);
  assert.ok(!/prefers-color-scheme|data-theme|\.dark\b/.test(styles + landing), 'A new mode needs its own validation before support is claimed.');
  assert.match(styles + landing, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /:focus-visible/);
});
