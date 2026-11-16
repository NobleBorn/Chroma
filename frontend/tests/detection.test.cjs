const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DetectionStream } = require('../.test-build/detection-stream.js');
const { parseServerMessage } = require('../.test-build/detection-protocol.js');
const { videoRect, displayBox } = require('../.test-build/overlay.js');

const result = (frame_id = 0) => ({
  type: 'result', frame_id, width: 960, height: 540, processing_ms: 3,
  boxes: [{ track_id: 1, x: 100, y: 80, width: 120, height: 100, color: '#ffff00' }],
});

function browserFixture(t, options = {}) {
  const originals = new Map();
  function replace(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  let pendingEncode;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(callback) {
      const encode = () => callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
      if (options.deferEncoding) pendingEncode = encode;
      else queueMicrotask(encode);
    },
  };
  class Socket {
    static OPEN = 1;
    static latest;
    readyState = 0;
    sent = [];
    constructor() { Socket.latest = this; }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    ready() { this.readyState = 1; this.receive({ type: 'ready' }); }
  }
  replace('WebSocket', Socket);
  replace('document', { createElement: () => canvas });
  replace('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
  replace('FileReader', class {
    readAsDataURL() { this.result = 'data:image/jpeg;base64,anBlZw=='; queueMicrotask(() => this.onload()); }
  });
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const results = [], errors = [];
  const stream = new DetectionStream({ videoWidth: 1920, videoHeight: 1080, readyState: 2 }, {
    onConnected() {},
    onResult: (value) => results.push(value),
    onError: (error) => errors.push(error),
  });
  t.after(() => stream.stop());
  stream.start('ws://localhost:8000/ws/detect');
  return { stream, socket: Socket.latest, results, errors, finishEncode: () => pendingEncode() };
}

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Expected stream event did not occur');
}

test('protocol rejects malformed results and accepts empty detections', () => {
  assert.deepEqual(parseServerMessage(JSON.stringify(result())), result());
  assert.deepEqual(parseServerMessage(JSON.stringify({ ...result(), boxes: [] })).boxes, []);
  for (const invalid of [
    { ...result(), width: 0 },
    { ...result(), frame_id: -1 },
    { ...result(), processing_ms: 'fast' },
    { ...result(), boxes: [{ ...result().boxes[0], color: 'invalid' }] },
  ]) assert.throws(() => parseServerMessage(JSON.stringify(invalid)));
});

test('overlay maps letterboxing and mirrored coordinates without mirroring text', () => {
  const rect = videoRect(300, 500, 960, 540);
  assert.equal(rect.y, 165.625);
  const box = result().boxes[0];
  assert.deepEqual(displayBox(box, rect, 960, false), { x: 31.25, y: 190.625, width: 37.5, height: 31.25 });
  assert.deepEqual(displayBox(box, rect, 960, true), { x: 231.25, y: 190.625, width: 37.5, height: 31.25 });
});

test('only sends the next frame after a matching result, downscaling large cameras', async (t) => {
  const { socket, results } = browserFixture(t);
  assert.equal(socket.sent.length, 0);
  socket.ready();
  await waitFor(() => socket.sent.length === 1);
  assert.equal(socket.sent[0].frame_id, 0);
  assert.equal(socket.sent[0].settings.min_area, 700);
  assert.deepEqual(socket.sent[0].settings.lower_hsv, [18, 100, 100]);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(socket.sent.length, 1, 'No queued second frame while waiting');
  socket.receive(result());
  await waitFor(() => socket.sent.length === 2);
  assert.equal(results.length, 1);
  assert.equal(socket.sent[1].frame_id, 1);
});

test('rejects out-of-order results and closes the connection', async (t) => {
  const { socket, errors, results } = browserFixture(t);
  socket.ready();
  await waitFor(() => socket.sent.length === 1);
  socket.receive(result(99));
  assert.equal(socket.readyState, 3);
  assert.equal(results.length, 0);
  assert.match(errors[0], /unexpected frame/);
});

test('stopping during encoding never uploads the late frame', async (t) => {
  const { stream, socket, finishEncode } = browserFixture(t, { deferEncoding: true });
  socket.ready();
  await new Promise(resolve => setTimeout(resolve, 10));
  stream.stop();
  finishEncode();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(socket.sent.length, 0);
});

test('server rejection stops processing and exposes an actionable error', async (t) => {
  const { socket, errors } = browserFixture(t);
  socket.ready();
  await waitFor(() => socket.sent.length === 1);
  socket.receive({ type: 'error', message: 'Invalid frame or settings.' });
  assert.deepEqual(errors, ['Invalid frame or settings.']);
  assert.equal(socket.readyState, 3);
});

test('handshake timeout closes a silent server', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { socket, errors } = browserFixture(t);
  t.mock.timers.tick(10_000);
  assert.equal(socket.readyState, 3);
  assert.match(errors[0], /did not respond/);
});

test('frame timeout closes a connection that stops responding', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { socket, errors } = browserFixture(t);
  socket.ready();
  t.mock.timers.tick(1);
  // Flush JPEG encoding and FileReader microtasks before simulating network delay.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(socket.sent.length, 1);
  t.mock.timers.tick(10_000);
  assert.equal(socket.readyState, 3);
  assert.match(errors[0], /timed out/);
});

test('live updates reuse the connection and ignore replies for old settings', async (t) => {
  const { stream, socket, results } = browserFixture(t);
  socket.ready();
  await waitFor(() => socket.sent.length === 1);
  const { defaultSettings, settingsForColor } = require('../.test-build/color-settings.js');
  const red = settingsForColor('#ff0000', defaultSettings());
  stream.setSettings(red);
  socket.receive(result());
  await waitFor(() => socket.sent.length === 2);
  assert.equal(results.length, 0, 'An old target must not reappear');
  assert.deepEqual(socket.sent[1].settings, red);
  socket.receive({ ...result(1), boxes: [{ ...result().boxes[0], color: '#ff0000' }] });
  assert.equal(results.length, 1);
  assert.equal(socket.readyState, 1);
});

test('encoding uses a settings snapshot and schedules the changed target next', async (t) => {
  const { stream, socket, finishEncode, results } = browserFixture(t, { deferEncoding: true });
  socket.ready();
  await new Promise(resolve => setTimeout(resolve, 10));
  const { defaultSettings, settingsForColor } = require('../.test-build/color-settings.js');
  stream.setSettings(settingsForColor('#0000ff', defaultSettings()));
  finishEncode();
  await waitFor(() => socket.sent.length === 1);
  assert.equal(socket.sent[0].settings.color, '#ffff00');
  socket.receive(result());
  assert.equal(results.length, 0);
  await new Promise(resolve => setTimeout(resolve, 80));
  finishEncode();
  await waitFor(() => socket.sent.length === 2);
  assert.equal(socket.sent[1].settings.color, '#0000ff');
});
