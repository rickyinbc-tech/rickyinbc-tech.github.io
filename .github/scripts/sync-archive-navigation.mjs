import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(path.join(root, '.github/data/artwork-manifest.json'), 'utf8'));
const read = relative => readFile(path.join(root, relative.replace(/^\//, ''), 'index.html'), 'utf8');
const text = value => value.replace(/<[^>]+>/g, '').trim();
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
// Search-only terms; preserve the documented artwork titles on the page.
const extraSearchAliases = new Map([
  ['coil-field', '整整有条'],
  ['shunkan-instant', 'Shunkan'],
  ['start-sequence', 'swimming pool diving 游泳 泳池 跳水'],
  ['swimming-in-motion', 'swimming pool 游泳 泳池']
]);
const searchAliases = new Map(await Promise.all(manifest.artworks.map(async artwork => {
  const aliases = await Promise.all(['', '/zh-hant', '/zh-hans'].map(async prefix => {
    const html = await read(`${prefix}/works/${artwork.id}/`);
    return `${text(html.match(/<h1>([\s\S]*?)<\/h1>/i)[1])} ${html.match(/<div class="feature-image"><img[^>]*alt="([^"]*)"/)?.[1] || ''}`;
  }));
  return [artwork.id, `${aliases.join(' ')} ${extraSearchAliases.get(artwork.id) || ''}`];
})));
const copies = {
  en: { back: 'Back to gallery', previous: 'Previous photograph', next: 'Next photograph', sequence: 'Browse photographs', position: (n, total) => `${n} of ${total}` },
  'zh-hant': { back: '返回作品選輯', previous: '上一張作品', next: '下一張作品', sequence: '瀏覽作品', position: (n, total) => `第 ${n} 張，共 ${total} 張` },
  'zh-hans': { back: '返回作品选辑', previous: '上一张作品', next: '下一张作品', sequence: '浏览作品', position: (n, total) => `第 ${n} 张，共 ${total} 张` }
};
for (const language of ['en', 'zh-hant', 'zh-hans']) {
  const prefix = language === 'en' ? '' : `/${language}`;
  const galleryPath = language === 'en' ? '/selected-works/' : `${prefix}/works/`;
  let galleryHtml = await read(galleryPath);
  const sources = new Map(await Promise.all(manifest.artworks.map(async artwork => [artwork.id, await read(`${prefix}/works/${artwork.id}/`)])));
  const entry = id => ({ href: `${prefix}/works/${id}/`, title: text(sources.get(id).match(/<h1>([\s\S]*?)<\/h1>/i)[1]) });
  const gallery = [...galleryHtml.matchAll(/<(a|article)\b([^>]*class="work-card(?:\s[^"']*)?"[^>]*)>([\s\S]*?)<\/\1>/g)].map(match => {
    const href = `${match[2]} ${match[3]}`.match(/href="([^"]*\/works\/([a-z0-9-]+)\/)"/);
    const series = match[2].match(/data-series="([^"]+)"/)?.[1];
    if (!href || !series) return null;
    return { ...entry(href[2]), series, search: `${text(match[3].match(/<span class="work-caption">([\s\S]*?)<\/span>/)?.[1] || '')} ${match[3].match(/\balt="([^"]+)"/)?.[1] || ''} ${series} ${searchAliases.get(href[2])}` };
  }).filter(Boolean);
  if (gallery.length !== 12) throw new Error(`${language}: expected twelve curated works, found ${gallery.length}`);
  galleryHtml = galleryHtml.replace(/<(a|article)\b([^>]*class="work-card(?:\s[^"']*)?"[^>]*)>([\s\S]*?)<\/\1>/g, (block, tag, attributes, content) => {
    const id = `${attributes} ${content}`.match(/href="[^"]*\/works\/([a-z0-9-]+)\/"/)?.[1];
    const item = gallery.find(entry => entry.href.endsWith(`/works/${id}/`));
    if (!item) return block;
    return block.replace(`<${tag}${attributes}>`, `<${tag}${attributes.replace(/\sdata-search="[^"]*"/g, '')} data-search="${escape(item.search)}">`);
  });
  await writeFile(path.join(root, galleryPath, 'index.html'), galleryHtml);
  const seriesModels = new Map();
  for (const slug of ['ritual', 'collision', 'motion', 'city-light']) {
    const seriesPath = `${prefix}/series/${slug}/`;
    const html = await read(seriesPath);
    const ids = [...html.matchAll(/class="work-card-link" href="[^"]*\/works\/([a-z0-9-]+)\//g)].map(match => match[1]);
    const extras = manifest.artworks.filter(a => a.seriesPath === `/series/${slug}/` && !ids.includes(a.id));
    const entries = [...new Set([...ids, ...extras.map(a => a.id)])].map(entry);
    const names = { ritual: ['Ritual', '儀式', '仪式'], collision: ['Collision', '碰撞', '碰撞'], motion: ['Motion', '動態', '动态'], 'city-light': ['City Light', '城市之光', '城市之光'] };
    seriesModels.set(`/series/${slug}/`, { series: entries, seriesPath, seriesName: names[slug][['en', 'zh-hant', 'zh-hans'].indexOf(language)] });
  }
  for (const artwork of manifest.artworks) {
    const model = { gallery, ...(seriesModels.get(artwork.seriesPath) || { series: [entry(artwork.id)], seriesPath: galleryPath, seriesName: copies[language].sequence }) };
    const current = entry(artwork.id);
    const index = model.series.findIndex(item => item.href === current.href);
    const copy = copies[language];
    const links = [[-1, copy.previous], [1, copy.next]].map(([offset, label]) => {
      const item = model.series[index + offset];
      return item ? `<a class="sequence-${offset < 0 ? 'previous' : 'next'}" rel="${offset < 0 ? 'prev' : 'next'}" href="${item.href}"><small>${label}</small><span>${escape(item.title)}</span></a>` : '';
    }).join('');
    const navigation = `<div class="wrap sequence-wrap" data-archive-navigation><nav class="artwork-pagination" aria-label="${copy.sequence}"><p class="sequence-label">${model.seriesName} · ${copy.position(index + 1, model.series.length)}</p>${links}</nav></div>\n<script id="archive-navigation" type="application/json">${JSON.stringify(model).replaceAll('<', '\\u003c')}</script>`;
    let html = sources.get(artwork.id).replace(/<div class="wrap sequence-wrap" data-archive-navigation>[\s\S]*?<\/script>/g, '');
    html = html.replace(new RegExp(`<a class="button"(?: data-archive-return)? href="${galleryPath}">`), `<a class="button" data-archive-return href="${galleryPath}">`);
    html = html.replace(/(<a class="button" data-archive-return href="[^"]+">)[\s\S]*?<\/a>/, `$1${copy.back}</a>`);
    const figure = html.indexOf('<figure class="artwork-figure">');
    const sectionEnd = html.indexOf('</section>', figure) + '</section>'.length;
    html = `${html.slice(0, sectionEnd)}\n${navigation}${html.slice(sectionEnd).replace(/^\s*/, "\n\n")}`;
    await writeFile(path.join(root, current.href, 'index.html'), html);
  }
}
console.log('Synchronized collection order and static previous/next links for 66 artwork pages.');
