const { test } = require('node:test');
const assert = require('node:assert/strict');
const { monitorCameraFeed } = require('../.test-build/camera-feed-monitor.js');

function fixture(t, fallback = false) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const document = new EventTarget();
  document.hidden = false;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  t.after(() => {
    stop();
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  let callback, frames = 0, failures = 0, cancelled = 0;
  const video = {
    readyState: 2, videoWidth: 640, videoHeight: 360, paused: false,
    requestVideoFrameCallback: fallback ? undefined : (next) => { callback = next; return 1; },
    cancelVideoFrameCallback: () => { cancelled++; },
    getVideoPlaybackQuality: () => ({ totalVideoFrames: frames }),
  };
  const stop = monitorCameraFeed(video, () => { failures++; });
  return {
    document, video, stop,
    tick(ms) { now += ms; t.mock.timers.tick(ms); },
    frame() { frames++; callback?.(); },
    decodedOnly() { frames++; },
    failures: () => failures,
    cancelled: () => cancelled,
  };
}

test('camera that never delivers its first frame times out once', (t) => {
  const monitor = fixture(t);
  monitor.video.readyState = 0;
  monitor.tick(5000);
  assert.equal(monitor.failures(), 1);
  assert.equal(monitor.cancelled(), 1);
  monitor.tick(10000);
  assert.equal(monitor.failures(), 1);
});

test('a motionless scene with continuing frame delivery is healthy', (t) => {
  const monitor = fixture(t);
  for (let i = 0; i < 20; i++) {
    monitor.frame();
    monitor.tick(500);
  }
  assert.equal(monitor.failures(), 0);
});

test('a live feed that stops producing frames times out', (t) => {
  const monitor = fixture(t);
  monitor.tick(3000);
  monitor.frame();
  monitor.tick(4500);
  assert.equal(monitor.failures(), 0);
  monitor.tick(500);
  assert.equal(monitor.failures(), 1);
});

test('hidden tabs do not fail and receive a fresh grace period on return', (t) => {
  const monitor = fixture(t);
  monitor.document.hidden = true;
  monitor.tick(30000);
  assert.equal(monitor.failures(), 0);
  monitor.document.hidden = false;
  monitor.document.dispatchEvent(new Event('visibilitychange'));
  monitor.tick(4500);
  assert.equal(monitor.failures(), 0);
  monitor.frame();
  monitor.tick(1000);
  assert.equal(monitor.failures(), 0);
});

test('stopping the monitor cancels callbacks and pending errors', (t) => {
  const monitor = fixture(t);
  monitor.stop();
  monitor.tick(10000);
  assert.equal(monitor.failures(), 0);
  assert.equal(monitor.cancelled(), 1);
});

test('fallback checks decoded frame counts when frame callbacks are unavailable', (t) => {
  const monitor = fixture(t, true);
  for (let i = 0; i < 15; i++) {
    monitor.frame();
    monitor.tick(500);
  }
  assert.equal(monitor.failures(), 0);
  monitor.tick(5000);
  assert.equal(monitor.failures(), 1);
});

test('offscreen decoding stays healthy even without compositor callbacks', (t) => {
  const monitor = fixture(t);
  for (let i = 0; i < 20; i++) {
    monitor.decodedOnly();
    monitor.tick(500);
  }
  assert.equal(monitor.failures(), 0);
});
