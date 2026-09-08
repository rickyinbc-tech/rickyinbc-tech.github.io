import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../assets/site.js', import.meta.url), 'utf8');
function page({ preference = null, hostname = 'rickykwok.com', storageBlocked = false } = {}) {
  const nodes = [];
  const listeners = {};
  const storage = new Map(preference ? [['rickykwok.analytics-consent.v2', preference]] : []);
  function element(tagName) {
    return { tagName, dataset: {}, children: [], setAttribute() {}, addEventListener() {},
      append(...children) { this.children.push(...children); nodes.push(...children); },
      remove() { nodes.splice(nodes.indexOf(this), 1); } };
  }
  const document = {
    documentElement: { lang: 'zh-Hant' }, referrer: 'https://example.com/story/?email=private#secret',
    head: element('HEAD'), body: element('BODY'),
    createElement: element,
    querySelector(selector) {
      if (selector === 'script[data-google-analytics="true"]') return nodes.find(n => n.dataset?.googleAnalytics === 'true') || null;
      if (selector === '.analytics-consent') return nodes.find(n => n.className === 'analytics-consent') || null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { (listeners[`document:${name}`] ||= []).push(callback); }
  };
  const window = {
    location: new URL(`https://${hostname}/selected-works/?email=private#secret`),
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
    },
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); }
  };
  const context = vm.createContext({ window, document, URL });
  vm.runInContext(source, context);
  return {
    run: code => vm.runInContext(code, context), window, storage, listeners, nodes,
    commands: () => Array.from(window.dataLayer || [], args => Array.from(args)),
    tags: () => nodes.filter(n => n.dataset?.googleAnalytics === 'true')
  };
}

test('new and declining visitors have no Google tag or queued events', () => {
  for (const preference of [null, 'denied']) {
    const p = page({ preference });
    p.run('trackEvent("artwork_open", {artwork_id:"coil-field"})');
    assert.equal(p.tags().length, 0);
    assert.equal(p.commands().length, 0);
  }
});

test('repeated acceptance and revoke/regrant produce one config and one loader', () => {
  const p = page({ preference: 'granted' });
  p.run('allowAnalytics(); allowAnalytics(); declineAnalytics(); allowAnalytics();');
  assert.equal(p.tags().length, 1);
  assert.equal(p.commands().filter(c => c[0] === 'config').length, 1);
  const consent = p.commands().filter(c => c[0] === 'consent');
  assert.deepEqual(consent.map(c => c[1]), ['default', 'update', 'update']);
  assert.equal(consent.at(-1)[2].analytics_storage, 'granted');
  assert.equal(consent.at(-1)[2].ad_storage, 'denied');
});

test('config strips query strings and fragments from page location and referrer', () => {
  const p = page({ preference: 'granted' });
  const config = p.commands().find(c => c[0] === 'config')[2];
  assert.equal(config.page_location, 'https://rickykwok.com/selected-works/');
  assert.equal(config.page_referrer, 'https://example.com/story/');
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
});

test('preview hosts cannot load Analytics even with an existing consent preference', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'preview.example.com']) {
    const p = page({ hostname, preference: 'granted' });
    p.run('allowAnalytics(); trackEvent("gallery_filter", {series:"ritual"});');
    assert.equal(p.tags().length, 0);
    assert.equal(p.commands().length, 0);
  }
});

test('custom events permit only the governed names and public slug parameters', () => {
  const p = page({ preference: 'granted' });
  p.run('trackEvent("gallery_filter", {series:"ritual", content_language:"zh-hant", email:"private@example.com", artwork_id:"a?secret"}); trackEvent("unapproved_event", {});');
  const events = p.commands().filter(c => c[0] === 'event');
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0][2]).sort(), ['content_language', 'send_to', 'series']);
  p.run('declineAnalytics(); trackEvent("gallery_filter", {series:"motion"});');
  assert.equal(p.commands().filter(c => c[0] === 'event').length, 1);
});

test('withdrawal or clearing consent in another tab stops events', () => {
  for (const key of ['rickykwok.analytics-consent.v2', null]) {
    const p = page({ preference: 'granted' });
    p.storage.clear();
    p.listeners.storage[0]({ key });
    p.run('trackEvent("gallery_filter", {series:"motion"});');
    assert.equal(p.commands().filter(c => c[0] === 'event').length, 0);
    assert.equal(p.window['ga-disable-G-07PQV08YPD'], true);
  }
});

test('blocked local storage still permits explicit consent for this page only', () => {
  const p = page({ storageBlocked: true });
  assert.equal(p.tags().length, 0);
  p.run('setAnalyticsPreference("granted"); allowAnalytics(); trackEvent("gallery_filter", {series:"motion"});');
  assert.equal(p.tags().length, 1);
  assert.equal(p.commands().filter(c => c[0] === 'event').length, 1);
});

test('artwork and language clicks are captured without sending link URLs', () => {
  const p = page({ preference: 'granted' });
  const artwork = { href:'https://rickykwok.com/zh-hant/works/coil-field/?email=private', closest: selector => selector === '.work-card' ? {} : null };
  const language = { href:'https://rickykwok.com/zh-hans/works/', lang:'zh-Hans', getAttribute: () => null, closest: selector => selector === '.language-switcher' ? {} : null };
  for (const link of [artwork, language]) {
    for (const callback of p.listeners['document:click']) callback({ target: { closest: () => link } });
  }
  const events = p.commands().filter(c => c[0] === 'event');
  assert.deepEqual(events.map(c => c[1]), ['artwork_open', 'language_switch']);
  assert.equal(events[0][2].artwork_id, 'coil-field');
  assert.equal(events[1][2].content_language, 'zh-hans');
  assert.ok(!JSON.stringify(events).includes('private'));
});
