const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../sources/amazon-jp/index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../sources/amazon-jp/manifest.json'), 'utf8'));

function runtime() {
  let extension;
  const requests = [];
  const context = vm.createContext({
    URL, URLSearchParams,
    registerExtension(value) { extension = value; },
    log: { info() {}, debug() {}, warn() {}, error() {} },
    utils: { isDownloadCancelled: () => false, sleep: () => true },
    fetch(url, options) {
      requests.push({ url, options });
      if (new URL(url).pathname === '/config.json') {
        return { ok: true, status: 200, json: () => ({
          deviceId: 'fixture', sessionId: 'fixture',
          csrf: { token: 'fixture-token', ts: '1234567890', rnd: '987654321' },
        }) };
      }
      return { ok: true, status: 200, text: () => JSON.stringify({ methods: [] }) };
    },
  });
  vm.runInContext(source, context);
  return { context, extension, requests };
}

test('Amazon JP package identity and version match its manifest', () => {
  const { context } = runtime();
  assert.equal(manifest.name, 'amazon-jp');
  assert.equal(context.EXTENSION_VERSION, manifest.version);
});

test('Amazon JP defaults all regional links to the Japanese catalog', () => {
  const { context } = runtime();
  for (const host of ['music.amazon.com', 'music.amazon.co.uk', 'music.amazon.in', 'music.amazon.de', 'music.amazon.co.jp']) {
    const resolved = context.createAmazonContext('https://' + host + '/albums/B000000001');
    assert.equal(resolved.host, 'music.amazon.co.jp');
    assert.equal(resolved.musicBaseURL, 'https://music.amazon.co.jp');
    assert.equal(resolved.currency, 'JPY');
  }
});

test('Amazon JP initializes and requests the Japanese catalog by default', () => {
  const { context, extension, requests } = runtime();
  extension.initialize({});
  assert.equal(context._currentContext.host, 'music.amazon.co.jp');
  assert.equal(context._homeCountry, 'JP');
  assert.ok(requests.some(request => request.url.startsWith('https://music.amazon.co.jp/config.json')));
});

test('Amazon JP provider identity is used in returned track metadata', () => {
  assert.match(source, /provider_id: "amazon-jp"/);
  assert.doesNotMatch(source, /provider_id: "amazon"/);
});
