// Optional local browser regression suite. Uses the installed agent-browser CLI.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = (process.argv[2] || 'http://127.0.0.1:4173').replace(/\/$/, '');
const session = `photo-regression-${process.pid}`;
const results = [];
function browser(...args) {
  const output = execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', maxBuffer: 8e6 });
  const result = JSON.parse(output);
  if (!result.success) throw new Error(result.error || output);
  return result.data;
}
const evaluate = source => browser('eval', source).result;
// Navigation may finish parsing before the deferred enhancement script runs.
const ready = () => browser('wait', '--fn', 'document.querySelector(".site-header.nav-enhanced") !== null');
const open = path => { const result = browser('open', `${base}${path}`); ready(); return result; };
const click = selector => { const result = browser('click', selector); ready(); return result; };
const wait = source => browser('wait', '--fn', source);
const check = (name, callback) => { callback(); results.push(name); console.log(`PASS ${name}`); };
try {
  browser('set', 'viewport', '390', '844');
  open('/selected-works/');
  evaluate("localStorage.setItem('rickykwok.analytics-consent.v2','denied');document.querySelector('.analytics-consent')?.remove()");
  check('Explicit return preserves Ritual, search, scroll and keyboard focus', () => {
    click('[data-filter="ritual"]');
    browser('fill', '#gallery-search', 'night');
    assert.equal(evaluate('document.querySelectorAll(".gallery-grid > :not([hidden])").length'), 2);
    evaluate("document.querySelector('a[href*=\"/works/night-fishermen/\"]').scrollIntoView({block:'center',behavior:'instant'})");
    const y = evaluate('scrollY');
    click('a[href*="/works/night-fishermen/"]');
    click('a.button[href^="/selected-works/"]');
    wait("document.querySelector('#gallery-search') !== null");
    assert.equal(evaluate('document.querySelector("#gallery-search").value'), 'night');
    wait("document.activeElement.pathname?.endsWith('/works/night-fishermen/')");
    assert.equal(evaluate('document.querySelector("[aria-pressed=true]").dataset.filter'), 'ritual');
    assert.ok(Math.abs(evaluate('scrollY') - y) < 4);
  });
  if (!process.argv.includes('--regression-only')) {
    check('Browser Back independently preserves the same gallery state', () => {
      const y = evaluate('scrollY');
      click('a[href*="/works/night-fishermen/"]'); browser('back');
      wait("document.activeElement.pathname?.endsWith('/works/night-fishermen/')");
      assert.equal(evaluate('document.querySelector("#gallery-search").value'), 'night');
      assert.equal(evaluate('location.hash'), '#ritual');
      assert.ok(Math.abs(evaluate('scrollY') - y) < 4);
    });
    check('Deep links, empty state, reset and hidden keyboard targets', () => {
      open('/selected-works/?q=night#ritual');
      assert.equal(evaluate('document.querySelector(".gallery-status").textContent'), '2 of 12 photographs');
      assert.equal(evaluate('[...document.querySelectorAll(".gallery-grid > [hidden] a, .gallery-grid > [hidden] button")].every(node=>node.getClientRects().length===0)'), true);
      browser('fill', '#gallery-search', 'zzzz-unmatched');
      assert.equal(evaluate('document.querySelector(".gallery-empty").hidden'), false);
      assert.equal(evaluate('document.querySelector(".gallery-status").textContent'), '0 of 12 photographs');
      click('.gallery-empty button');
      assert.equal(evaluate('document.querySelectorAll(".gallery-grid > :not([hidden])").length'), 12);
      assert.equal(evaluate('document.activeElement.id'), 'gallery-search');
      click('[data-filter="motion"]');
      assert.equal(evaluate('document.querySelector(".gallery-reset").hidden'), false);
      browser('fill', '#gallery-search', 'swimming');
      click('.gallery-reset');
      assert.equal(evaluate('location.search + location.hash'), '');
      assert.equal(evaluate('document.querySelector(".gallery-reset").hidden'), true);
      assert.equal(evaluate('document.querySelectorAll(".gallery-grid > :not([hidden])").length'), 12);
      assert.equal(evaluate('document.activeElement.id'), 'gallery-search');
    });
    check('Viewer supports mouse, arrows, touch, Tab, Escape and focus restoration', () => {
      open('/selected-works/#ritual');
      click('.gallery-grid .work-card:not([hidden]) .work-zoom');
      assert.equal(evaluate('document.querySelector("dialog").open'), true);
      browser('press', 'ArrowRight');
      assert.equal(evaluate('document.querySelector("#viewer-title").textContent'), 'Night Fishermen');
      evaluate("{const s=document.querySelector('.viewer-stage');s.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',clientX:280,clientY:200}));s.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',clientX:100,clientY:200}));}");
      assert.equal(evaluate('document.querySelector("#viewer-title").textContent'), 'Blue Hour, River Stage');
      for (let i = 0; i < 7; i++) { browser('press', 'Tab'); assert.equal(evaluate('document.querySelector("dialog").contains(document.activeElement)'), true); }
      browser('press', 'Shift+Tab');
      assert.equal(evaluate('document.querySelector("dialog").contains(document.activeElement)'), true);
      browser('press', 'Escape');
      assert.equal(evaluate('document.querySelector("dialog").open'), false);
      assert.equal(evaluate('document.activeElement.getAttribute("aria-label")'), 'View larger: 整整有條');
    });
    check('Series navigation follows collection order and retains its return path', () => {
      open('/series/ritual/');
      click('a.work-card-link[href*="/works/night-fishermen/"]');
      assert.equal(evaluate('document.querySelector("[data-archive-return]").pathname'), '/series/ritual/');
      assert.equal(evaluate('document.querySelector(".sequence-previous").pathname'), '/works/blue-hour-river-stage/');
      assert.equal(evaluate('document.querySelector(".sequence-next").pathname'), '/works/dragon-night-festival/');
      click('.sequence-next');
      assert.equal(evaluate('document.querySelector("[data-archive-return]").pathname'), '/series/ritual/');
    });
    check('Direct artwork links have static navigation and a sensible gallery return', () => {
      open('/works/night-fishermen/');
      assert.equal(evaluate('document.querySelector("[data-archive-return]").pathname'), '/selected-works/');
      assert.ok(evaluate('document.querySelectorAll(".artwork-pagination a").length') > 0);
      click('.artwork-enlarge'); browser('press', 'Escape');
      assert.equal(evaluate('document.activeElement.className'), 'artwork-enlarge');
    });
    check('Language changes retain equivalent artwork, gallery state and search aliases', () => {
      open('/selected-works/?q=night#ritual');
      for (const language of ['zh-Hant', 'zh-Hans', 'en']) {
        click('.nav-toggle'); click(`.language-switcher a[lang="${language}"]`);
        assert.equal(evaluate('document.documentElement.lang'), language);
        assert.equal(evaluate('document.querySelectorAll(".gallery-grid > :not([hidden])").length'), 2);
        assert.equal(evaluate('location.hash'), '#ritual');
      }
      click('a[href*="/works/night-fishermen/"]');
      for (const language of ['zh-Hant', 'zh-Hans', 'en']) {
        click('.nav-toggle'); click(`.language-switcher a[lang="${language}"]`);
        assert.ok(evaluate('location.pathname').endsWith('/works/night-fishermen/'));
        assert.ok(evaluate('document.querySelector("[data-archive-return]").href').includes('q=night#ritual'));
      }
    });
    check('Opening photographs have a translated viewer, record link and series shortcut', () => {
      for (const [path, language] of [['/', 'en'], ['/zh-hant/', 'zh-Hant'], ['/zh-hans/', 'zh-Hans']]) {
        open(path);
        const prefix = language === 'en' ? '' : `/${language.toLowerCase()}`;
        assert.equal(evaluate('document.querySelector(".home-feature-link").pathname'), `${prefix}/works/light-encroached-homes/`);
        click('.home-zoom');
        assert.equal(evaluate('document.querySelector("dialog").open'), true);
        assert.equal(evaluate('document.querySelector(".viewer-controls a").pathname'), `${prefix}/works/light-encroached-homes/`);
        assert.equal(evaluate('document.querySelector(".viewer-controls button").hidden'), true);
        browser('press', 'Escape');
        assert.equal(evaluate('document.activeElement.className'), 'home-zoom');
        click('.hero a[href="#home-series"]');
        assert.equal(evaluate('location.hash'), '#home-series');
        assert.ok(evaluate('document.querySelector("#home-series .series") !== null'));
        assert.equal(evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      }
    });
    check('The full opening photograph fits short desktop viewports', () => {
      browser('set', 'viewport', '1280', '633');
      open('/');
      assert.equal(evaluate('document.querySelector(".home-feature").getBoundingClientRect().bottom <= innerHeight'), true);
      assert.equal(evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      browser('set', 'viewport', '390', '844');
    });
    check('Mobile menu supports keyboard opening, Escape and focus restoration', () => {
      open('/');
      browser('focus', '.nav-toggle'); browser('press', 'Enter');
      assert.equal(evaluate('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'), 'true');
      browser('press', 'Tab');
      assert.equal(evaluate('document.activeElement.closest(".nav-links") !== null'), true);
      browser('press', 'Escape');
      assert.equal(evaluate('document.activeElement.className'), 'nav-toggle');
      assert.equal(evaluate('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'), 'false');
    });
  }
  console.log(JSON.stringify({ passed: results.length, base, tests: results }, null, 2));
} finally { try { browser('close'); } catch { /* Preserve the original test failure. */ } }
