const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS } = require('../.test-build/detection-protocol.js');
const { COLOR_PRESETS, defaultSettings, hexToHsv, settingsForColor, updateHsvBound } = require('../.test-build/color-settings.js');

test('color picker converts RGB into OpenCV HSV units', () => {
  const hues = [0, 60, 120, 30, 19, 150];
  COLOR_PRESETS.forEach((preset, index) => assert.equal(hexToHsv(preset.color)[0], hues[index]));
  assert.deepEqual(hexToHsv('#ffffff'), [0, 0, 255]);
  assert.deepEqual(hexToHsv('#000000'), [0, 0, 0]);
  assert.throws(() => hexToHsv('invalid'));
});

test('presets preserve area/tracking and red wraps through hue zero', () => {
  const settings = { ...defaultSettings(), min_area: 2000, tracking: false };
  const red = settingsForColor('#FF0000', settings);
  assert.deepEqual(red.lower_hsv, [170, 100, 100]);
  assert.deepEqual(red.upper_hsv, [10, 255, 255]);
  assert.equal(red.min_area, 2000);
  assert.equal(red.tracking, false);
  assert.deepEqual(settingsForColor('#ffff00', defaultSettings()), DEFAULT_SETTINGS);
});

test('achromatic colors can match their own saturation/value instead of excluding them', () => {
  for (const color of ['#ffffff', '#808080', '#000000', '#102030']) {
    const [h, s, v] = hexToHsv(color);
    const { lower_hsv: lower, upper_hsv: upper } = settingsForColor(color, defaultSettings());
    assert(h >= lower[0] && h <= upper[0]);
    assert(s >= lower[1] && s <= upper[1]);
    assert(v >= lower[2] && v <= upper[2]);
  }
});

test('HSV sliders preserve valid saturation/value ordering and allow hue wrapping', () => {
  const settings = defaultSettings();
  let next = updateHsvBound(settings, 1, 'max', 50);
  assert.equal(next.upper_hsv[1], 100);
  next = updateHsvBound(next, 1, 'min', 200);
  assert.equal(next.lower_hsv[1], 100);
  next = updateHsvBound(next, 0, 'min', 170);
  next = updateHsvBound(next, 0, 'max', 10);
  assert.deepEqual([next.lower_hsv[0], next.upper_hsv[0]], [170, 10]);
  assert.deepEqual(settings, DEFAULT_SETTINGS);
});

test('reset creates fresh settings without mutating shared defaults', () => {
  const settings = defaultSettings();
  settings.lower_hsv[0] = 0;
  settings.tracking = false;
  assert.deepEqual(defaultSettings(), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.lower_hsv[0], 18);
});
