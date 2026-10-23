import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../assets/site.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const GALLERY_FILTERS'), source.indexOf('const browseCopy'));
const context = vm.createContext({ URL, window: { location: new URL('https://rickykwok.com/') } });
vm.runInContext(helpers, context);
const run = expression => vm.runInContext(expression, context);
test('gallery deep links retain search and the established series hash', () => {
  assert.equal(run("readGalleryState('/selected-works/?q=Night%20Fishermen#ritual').query"), 'Night Fishermen');
  assert.equal(run("readGalleryState('/selected-works/?q=night#ritual').filter"), 'ritual');
  assert.equal(run("readGalleryState('/selected-works/#unknown').filter"), 'all');
});
test('search and series intersect; Unicode width, case and multiple terms normalise', () => {
  assert.equal(run("matchesGallery({series:'Ritual',search:'Night Fishermen Ritual'}, {filter:'ritual',query:'ＮＩＧＨＴ fishermen'})"), true);
  assert.equal(run("matchesGallery({series:'motion',search:'Night Swimmer'}, {filter:'ritual',query:'night'})"), false);
  assert.equal(run("matchesGallery({series:'ritual',search:'Night Fishermen'}, {filter:'all',query:'night missing'})"), false);
  assert.equal(run("matchesGallery({series:'ritual',search:'整整有條 儀式'}, {filter:'ritual',query:'整整有條'})"), true);
});
test('language switching maps gallery aliases and retains filter and query', () => {
  assert.equal(run("localizeCollection('/selected-works/?q=night#ritual','zh-hant')"), '/zh-hant/works/?q=night#ritual');
  assert.equal(run("localizeCollection('/zh-hant/works/?q=night#ritual','en')"), '/selected-works/?q=night#ritual');
  assert.equal(run("localizeCollection('/series/ritual/','zh-hans')"), '/zh-hans/series/ritual/');
});
test('return destinations cannot leave the site or link to arbitrary paths', () => {
  for (const input of ['https://example.com/selected-works/', '//example.com/works/', 'javascript:alert(1)', '/unknown/', '/works/night-fishermen/']) {
    assert.equal(run(`safeCollection(${JSON.stringify(input)})`), null);
  }
  assert.equal(run("safeCollection('/selected-works/?secret=x&q=night#ritual').search"), '?q=night');
});
test('blocked or malformed session storage leaves URL navigation usable', () => {
  assert.doesNotThrow(() => run("saveContext(new URL('https://rickykwok.com/selected-works/'), {y:100})"));
  assert.equal(run("savedContext(new URL('https://rickykwok.com/selected-works/'))"), null);
});
