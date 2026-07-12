#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"
require "fileutils"
require "json"
require "nokogiri"
require "set"
require "yaml"

ROOT = File.expand_path("../..", __dir__)
ORIGIN = "https://rickykwok.com"
DATA = YAML.safe_load(File.read(File.join(ROOT, ".github/data/localized-portfolio.yml")))
ARTWORKS = DATA.fetch("artworks")
SERIES = DATA.fetch("series")
PROJECTS = DATA.fetch("projects")
COLLECTIONS = DATA.fetch("collections")
CORE = DATA.fetch("core")
AWARDS = DATA.fetch("awards")
ONLY = ARGV.each_with_object(Set.new) do |argument, paths|
  next unless argument.start_with?("--only=")

  argument.delete_prefix("--only=").split(",").each { |path| paths << path }
end

# These previews are intentionally zoom-only: there is no approved permanent
# artwork record for them yet. Their existing English notes are translated here
# so Chinese visitors never open an English-only lightbox.
PREVIEW_LIGHTBOX = {
  "/assets/art/ancestral-kitchen-light.jpg" => {
    "title" => "祖屋廚房之光",
    "meta" => "儀式系列",
    "note" => "一道光把煙霧與身體動作塑成室內景觀。"
  },
  "/assets/art/candle-impact.jpg" => {
    "title" => "燭光衝擊",
    "meta" => "碰撞系列",
    "note" => "火焰與水在深黑空間中凝住猛烈的一刻。"
  },
  "/assets/art/chalk-impact.jpg" => {
    "title" => "粉筆衝擊",
    "meta" => "碰撞系列",
    "note" => "粉筆折成粉塵、碎片與明確的力量方向。"
  },
  "/assets/art/divers-motion.jpg" => {
    "title" => "躍入水中的動態",
    "meta" => "動態系列",
    "note" => "比賽起跳化成一道由色彩與身體組成的水平節奏。"
  },
  "/assets/art/festival-dragon.jpg" => {
    "title" => "節慶舞龍",
    "meta" => "儀式系列",
    "note" => "節慶能量在光線與街道中化成集體編舞。"
  },
  "/assets/art/hearth-ritual.jpg" => {
    "title" => "爐火儀式",
    "meta" => "儀式系列",
    "note" => "家中的火光把劇場、記憶與動作聚在一起。"
  },
  "/assets/art/hong-kong-fisheye-street.jpg" => {
    "title" => "香港魚眼街景",
    "meta" => "城市之光系列",
    "note" => "彎曲的空間與黃昏色彩把城市壓縮成一個舞台。"
  },
  "/assets/art/sack-race-village.jpg" => {
    "title" => "鄉村麻包競賽",
    "meta" => "儀式系列",
    "note" => "遊戲、建築與孩童動作組成公共的鄉村場景。"
  },
  "/assets/art/village-elders-laughter.jpg" => {
    "title" => "鄉村長者笑聲",
    "meta" => "儀式系列",
    "note" => "村屋外的笑聲呈現世代之間的溫度與互動。"
  },
  "/assets/art/yellow-arc-water-study.jpg" => {
    "title" => "黃色弧線",
    "meta" => "碰撞系列・水滴研究",
    "note" => "扭轉的水流在空間中短暫畫出一條弧線。"
  }
}.freeze
LIGHTBOX_PRINT = "收藏、展覽及圖片授權狀態由工作室按作品書面確認。".freeze
LIGHTBOX_SERIES = {
  "Ritual" => "儀式",
  "Collision" => "碰撞",
  "Motion" => "動態",
  "City Light" => "城市之光",
  "Documentary" => "紀實"
}.freeze
ALIASES = {
  "archive" => "/projects/",
  "available-prints" => "/editions/",
  "award-winning-hong-kong-photography" => "/awards/",
  "awards-recognition" => "/awards/",
  "awards/2013" => "/awards/#year-2013",
  "awards/2014" => "/awards/#year-2014",
  "awards/2015" => "/awards/#year-2015",
  "awards/2016" => "/awards/#year-2016",
  "awards/distinctions-exhibitions" => "/awards/#professional-distinction",
  "exhibitions-publications" => "/press/",
  "prints" => "/editions/",
  "selected-works" => "/works/",
  "series/documentary-theatre" => "/series/ritual/",
  "series/high-speed-impact" => "/series/collision/",
  "series/hong-kong-night-photography" => "/series/city-light/",
  "series/water-studies" => "/series/collision/",
  "sources-archive" => "/press/"
}.freeze

def generate?(key)
  ONLY.empty? || ONLY.include?(key)
end

def esc(value)
  CGI.escapeHTML(value.to_s)
end

def document(relative)
  Nokogiri::HTML(File.read(File.join(ROOT, relative)))
end

def absolute_image(src)
  src.to_s.start_with?("http") ? src.to_s : "#{ORIGIN}#{src}"
end

def write_page(relative, html)
  target = File.join(ROOT, relative, "index.html")
  FileUtils.mkdir_p(File.dirname(target))
  File.write(target, html)
end

def image_tag(node, alt:, eager: false)
  return "" unless node

  attrs = {
    "src" => node["src"],
    "srcset" => node["srcset"],
    "sizes" => node["sizes"],
    "alt" => alt,
    "loading" => eager ? "eager" : "lazy",
    "decoding" => "async",
    "fetchpriority" => eager ? "high" : nil,
    "width" => node["width"],
    "height" => node["height"]
  }.compact
  "<img #{attrs.map { |key, value| %(#{key}=\"#{esc(value)}\") }.join(" ")}>"
end

def language_switcher(english_route, local_route)
  <<~HTML
    <div class="language-switcher" aria-label="語言選擇">
      <a href="#{english_route}" lang="en">English</a>
      <a href="/zh-hant#{local_route}" lang="zh-Hant" aria-current="page">繁中</a>
      <a href="/zh-hans#{local_route}" lang="zh-Hans">简体</a>
    </div>
  HTML
end

def navigation(english_route, local_route, current: nil)
  labels = {
    "works" => ["作品", "/zh-hant/works/"],
    "series" => ["系列", "/zh-hant/series/"],
    "projects" => ["項目", "/zh-hant/projects/"],
    "press" => ["媒體", "/zh-hant/press/"],
    "collect" => ["收藏", "/zh-hant/editions/"],
    "license" => ["授權", "/zh-hant/licensing/"],
    "about" => ["關於", "/zh-hant/biography/"],
    "contact" => ["聯絡", "/zh-hant/contact/"]
  }
  links = labels.map do |key, (label, href)|
    marker = key == current ? ' aria-current="page"' : ""
    %(<a href="#{href}"#{marker}>#{label}</a>)
  end.join
  <<~HTML
    <header class="site-header" aria-label="主要導覽">
      <nav class="nav wrap">
        <a class="brand" href="/zh-hant/" aria-label="郭文棣首頁"><span>Ricky Kwok 郭文棣</span><small>藝術攝影</small></a>
        <div class="nav-links" aria-label="網站部分">#{links}</div>
        #{language_switcher(english_route, local_route)}
      </nav>
    </header>
  HTML
end

def page_head(title:, description:, english_route:, local_route:, image:, type: "WebPage", schema: {}, indexable: true)
  trad_url = "#{ORIGIN}/zh-hant#{local_route}"
  hans_url = "#{ORIGIN}/zh-hans#{local_route}"
  english_url = "#{ORIGIN}#{english_route}"
  graph = {
    "@context" => "https://schema.org",
    "@type" => type,
    "@id" => "#{trad_url}#webpage",
    "url" => trad_url,
    "name" => title,
    "description" => description,
    "inLanguage" => "zh-Hant",
    "dateModified" => "2026-07-11",
    "about" => { "@id" => "#{ORIGIN}/#person" }
  }.merge(schema)
  <<~HTML
    <!doctype html>
    <html lang="zh-Hant">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="robots" content="#{indexable ? "index, follow, max-image-preview:large" : "noindex, follow"}">
      <title>#{esc(title)}｜郭文棣 Ricky Kwok</title>
      <meta name="description" content="#{esc(description)}">
      <meta name="author" content="Ricky Kwok">
      <link rel="canonical" href="#{trad_url}">
      <link rel="alternate" hreflang="en" href="#{english_url}">
      <link rel="alternate" hreflang="zh-Hant" href="#{trad_url}">
      <link rel="alternate" hreflang="zh-Hans" href="#{hans_url}">
      <link rel="alternate" hreflang="x-default" href="#{english_url}">
      <meta property="og:title" content="#{esc(title)}｜郭文棣 Ricky Kwok">
      <meta property="og:description" content="#{esc(description)}">
      <meta property="og:type" content="#{type == "VisualArtwork" ? "article" : "website"}">
      <meta property="og:url" content="#{trad_url}">
      <meta property="og:image" content="#{esc(absolute_image(image))}">
      <meta property="og:site_name" content="Ricky Kwok Photography">
      <meta property="og:locale" content="zh_HK">
      <meta property="og:locale:alternate" content="zh_CN">
      <meta property="og:locale:alternate" content="en_US">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="#{esc(title)}｜郭文棣 Ricky Kwok">
      <meta name="twitter:description" content="#{esc(description)}">
      <meta name="twitter:image" content="#{esc(absolute_image(image))}">
      <meta name="theme-color" content="#070707">
      <link rel="icon" href="/favicon.svg" type="image/svg+xml">
      <link rel="preload" as="image" href="#{esc(image)}" fetchpriority="high">
      <link rel="stylesheet" href="/assets/site.min.css">
      <script type="application/ld+json">#{JSON.generate(graph)}</script>
    </head>
  HTML
end

def footer(english_route, local_route)
  <<~HTML
    <footer class="site-footer"><div class="wrap footer-row"><span>© <span id="year">2026</span> Ricky Kwok 郭文棣, ARPS.</span>#{language_switcher(english_route, local_route)}</div></footer>
    <script defer src="/assets/site.min.js"></script>
    </body></html>
  HTML
end

def local_href(href)
  return href if href.to_s.empty? || href.start_with?("#", "http", "mailto:", "tel:")
  path, suffix = href.split(/(?=[?#])/, 2)
  mapped = case path
           when "/selected-works/", "/works/" then "/zh-hant/works/"
           when "/prints/", "/available-prints/" then "/zh-hant/editions/"
           when "/awards-recognition/", "/awards/" then "/zh-hant/awards/"
           else "/zh-hant#{path}"
           end
  "#{mapped}#{suffix}"
end

def item_record(href)
  slug = href.to_s[%r{/works/([^/]+)/}, 1]
  return ARTWORKS[slug] if slug && ARTWORKS[slug]
  return COLLECTIONS[slug] if slug && COLLECTIONS[slug]

  series_slug = href.to_s[%r{/series/([^/]+)/}, 1]
  SERIES[series_slug]
end

def localized_lightbox_data(card, zoom, record)
  full = zoom&.[]("data-full") || card["data-full"]
  return nil if full.to_s.empty?

  preview = PREVIEW_LIGHTBOX[full]
  if record && !record.empty?
    series = record["series"].to_s
    series_name = LIGHTBOX_SERIES.fetch(series, series)
    return {
      "data-full" => full,
      "data-title" => record.fetch("title"),
      "data-meta" => "#{series_name}系列",
      "data-note" => record.fetch("summary"),
      "data-print" => LIGHTBOX_PRINT,
      "data-series" => zoom&.[]("data-series") || card["data-series"]
    }
  end

  return nil unless preview

  {
    "data-full" => full,
    "data-title" => preview.fetch("title"),
    "data-meta" => preview.fetch("meta"),
    "data-note" => preview.fetch("note"),
    "data-print" => LIGHTBOX_PRINT,
    "data-series" => zoom&.[]("data-series") || card["data-series"]
  }
end

def localized_modal(image)
  return "" unless image

  modal_image = image_tag(image, alt: "作品預覽影像", eager: false).sub("<img ", '<img id="modalImage" ')
  <<~HTML
    <div class="modal" id="artModal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="modalNote modalPrint" aria-hidden="true">
      <button class="modal-close" type="button" aria-label="關閉作品檢視">×</button>
      <div class="modal-inner">
        #{modal_image}
        <div class="modal-copy"><h3 id="modalTitle">作品預覽</h3><p id="modalMeta"></p><p id="modalNote"></p><p id="modalPrint">#{LIGHTBOX_PRINT}</p></div>
      </div>
    </div>
  HTML
end

def localized_work_card(card)
  direct_link = card.name == "a" ? card : card.at_css("a.work-card-link, a[href]")
  href = direct_link&.[]("href")
  record = item_record(href) || {}
  title = record["title"] || card.at_css(".work-caption strong, h3")&.text&.strip || "攝影作品"
  detail = if record && !record.empty?
             LIGHTBOX_SERIES.fetch(record["series"].to_s, record["series"].to_s)
           else
             card.at_css(".work-caption small")&.text&.strip || "郭文棣攝影作品"
           end
  image = card.at_css("img")
  classes = ["work-card", card["class"].to_s.split.reject { |name| name == "work-card" }].flatten.join(" ")
  zoom = card.at_css(".work-zoom, button.work-card")
  lightbox = localized_lightbox_data(card, zoom, record)
  title = lightbox.fetch("data-title", title) if lightbox
  detail = lightbox.fetch("data-meta", detail) if lightbox
  zoom_data = lightbox&.map do |name, value|
    %(#{name}="#{esc(value)}") unless value.to_s.empty?
  end&.compact&.join(" ").to_s
  if href.to_s.empty?
    # A series may legitimately include a preview-only image without an approved
    # artwork record. Keep it as a zoom control rather than emitting an empty link.
    return <<~HTML
      <button class="#{esc(classes)}" type="button" #{zoom_data} aria-label="放大檢視#{esc(title)}">
        #{image_tag(image, alt: "郭文棣攝影作品《#{title}》")}
        <span class="work-caption"><strong>#{esc(title)}</strong><small>#{esc(detail)}</small><span class="work-status">放大檢視</span></span>
      </button>
    HTML
  end

  zoom_button = if zoom_data.empty?
                  ""
                else
                  %(<button class="work-zoom" type="button" #{zoom_data} aria-label="放大檢視#{esc(title)}">放大</button>)
                end
  <<~HTML
    <article class="#{esc(classes)}" data-artwork-id="#{esc(href.to_s[%r{/works/([^/]+)/}, 1])}">
      <a class="work-card-link" href="#{esc(local_href(href))}" aria-label="查看完整作品：#{esc(title)}">
        #{image_tag(image, alt: "郭文棣攝影作品《#{title}》")}
        <span class="work-caption"><strong>#{esc(title)}</strong><small>#{esc(detail)}</small><span class="work-status">查看完整作品資料</span></span>
      </a>
      #{zoom_button}
    </article>
  HTML
end

def localized_record_card(card)
  link = card.at_css("a[href]")
  href = link&.[]("href")
  record = item_record(href) || {}
  title = record["title"] || card.at_css("h3")&.text&.strip || "攝影作品"
  summary = record["summary"] || "查看完整影像、作品脈絡與查詢資料。"
  <<~HTML
    <article class="proof-card">
      #{image_tag(card.at_css("img"), alt: "郭文棣攝影作品《#{title}》")}
      <div class="proof-body"><h3>#{esc(title)}</h3><p>#{esc(summary)}</p><ul class="link-list"><li><a href="#{esc(local_href(href))}">查看完整作品</a></li></ul></div>
    </article>
  HTML
end

def project_gallery(doc, title)
  seen = {}
  images = doc.css("main img").each_with_object([]) do |image, selected|
    src = image["src"]
    next if src.to_s.empty? || seen[src]
    seen[src] = true
    selected << image
  end
  images.each_with_index.map do |image, index|
    <<~HTML
      <figure class="proof-card">
        #{image_tag(image, alt: "#{title}相關影像 #{index + 1}")}
        <figcaption class="proof-body"><p>#{esc(title)}・影像 #{index + 1}</p></figcaption>
      </figure>
    HTML
  end.join
end

def artwork_page(slug, record)
  english_route = "/works/#{slug}/"
  local_route = english_route
  doc = document("works/#{slug}/index.html")
  feature = doc.at_css(".feature-image img") || doc.at_css("main img")
  image = feature&.[]("src") || doc.at_css('meta[property="og:image"]')&.[]("content")
  description = "#{record.fetch("summary")} 作品脈絡、完整影像及收藏、展覽與圖片授權資料。"
  schema = {
    "creator" => { "@id" => "#{ORIGIN}/#person" },
    "image" => {
      "@type" => "ImageObject",
      "contentUrl" => absolute_image(image),
      "creator" => { "@id" => "#{ORIGIN}/#person" },
      "creditText" => "Ricky Kwok 郭文棣",
      "copyrightNotice" => "Copyright Ricky Kwok",
      "license" => "#{ORIGIN}/zh-hant/licensing/",
      "acquireLicensePage" => "#{ORIGIN}/zh-hant/licensing/",
      "representativeOfPage" => true
    }
  }
  related = doc.css(".source-card").first(3).map do |card|
    link = card.at_css("a[href]")
    related_record = item_record(link&.[]("href")) || {}
    related_title = related_record["title"] || card.at_css("h3")&.text&.strip || "相關作品"
    related_image = card.at_css("img")
    <<~HTML
      <article class="source-card">
        #{image_tag(related_image, alt: "相關攝影作品《#{related_title}》")}
        <div class="source-body"><h3>#{esc(related_title)}</h3><p>沿着系列、物料或視覺節奏繼續閱讀。</p><ul class="link-list"><li><a href="#{esc(local_href(link&.[]("href")))}">查看相關作品</a></li></ul></div>
      </article>
    HTML
  end.join
  <<~HTML
    #{page_head(title: "#{record.fetch("title")} / #{record.fetch("english")}", description: description, english_route: english_route, local_route: local_route, image: image, type: "VisualArtwork", schema: schema)}
    <body class="artwork-page">
      <a class="skip-link" href="#main">跳至作品內容</a>
      #{navigation(english_route, local_route, current: "works")}
      <main id="main">
        <section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">作品・#{esc(record.fetch("series"))}</p><h1>#{esc(record.fetch("title"))}</h1><p class="hero-copy">#{esc(record.fetch("summary"))}</p></div></section>
        <section class="section"><div class="wrap split start"><div class="feature-image">#{image_tag(feature, alt: "郭文棣作品《#{record.fetch("title")}》完整影像", eager: true)}</div><div><p class="section-label">作品資料</p><h2>#{esc(record.fetch("title"))}</h2><ul class="meta-list artwork-meta"><li><strong>英文標題：</strong> #{esc(record.fetch("english"))}</li><li><strong>系列：</strong> #{esc(record.fetch("series"))}</li><li><strong>狀態：</strong> 收藏、展覽及授權狀態由工作室按作品書面確認。</li></ul><p class="prose">#{esc(record.fetch("text"))}</p><p class="prose"><strong>圖說：</strong>#{esc(record.fetch("summary"))}</p><div class="button-row"><a class="button" href="/zh-hant/contact/?type=print#inquiry-form">查詢收藏或展覽</a><a class="button" href="/zh-hant/licensing/">查詢圖片授權</a><a class="button" href="/zh-hant/works/">返回全部作品</a></div></div></div></section>
        <section class="section section-warm"><div class="wrap split start"><div><p class="section-label">完整影像原則</p><p class="statement">作品以完整構圖呈現，不以卡片比例裁去畫面。</p></div><div><p class="prose">本頁主圖使用完整比例。縮圖只用作導覽；打開作品記錄或放大檢視時，均應看到攝影師確定的整幅構圖。公開網頁檔案並非印刷原檔，任何出版、展覽或商業使用仍須取得書面授權。</p></div></div></section>
        #{related.empty? ? "" : %(<section class="section"><div class="wrap"><div class="section-head"><div><p class="section-label">相關作品</p><h2>沿系列繼續觀看。</h2></div><p class="lead">每個連結均進入同一語言的完整作品頁。</p></div><div class="source-grid">#{related}</div></div></section>)}
      </main>
      #{footer(english_route, local_route)}
  HTML
end

def collection_page(slug, record)
  english_route = "/works/#{slug}/"
  local_route = english_route
  doc = document("works/#{slug}/index.html")
  image = doc.at_css('meta[property="og:image"]')&.[]("content") || doc.at_css("main img")&.[]("src")
  cards = doc.css(".source-card").map { |card| localized_record_card(card) }.join
  <<~HTML
    #{page_head(title: record.fetch("title"), description: record.fetch("summary"), english_route: english_route, local_route: local_route, image: image, type: "CollectionPage")}
    <body><a class="skip-link" href="#main">跳至作品</a>#{navigation(english_route, local_route, current: "works")}
    <main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">主題作品組</p><h1>#{esc(record.fetch("title"))}</h1><p class="hero-copy">#{esc(record.fetch("summary"))}</p></div></section>
    <section class="section section-warm"><div class="wrap"><div class="section-head"><div><p class="section-label">完整作品</p><h2>以完整構圖閱讀每張照片。</h2></div><p class="lead">點入個別作品可查看影像脈絡、系列關係及收藏、展覽或授權方式。</p></div><div class="proof-grid">#{cards}</div></div></section>
    <section class="section"><div class="wrap split start"><div><p class="section-label">觀看脈絡</p><p class="statement">主題頁是閱讀入口，個別作品頁才是作品的固定記錄。</p></div><div><p class="prose">#{esc(record.fetch("summary"))} 本頁不另外製造與四個主要系列競爭的分類；它把相關影像聚在一起，並連回作品與系列的權威頁面。</p><div class="button-row"><a class="button" href="/zh-hant/works/">瀏覽全部作品</a><a class="button" href="/zh-hant/contact/">聯絡工作室</a></div></div></div></section></main>
    #{footer(english_route, local_route)}
  HTML
end

def series_page(slug, record)
  english_route = "/series/#{slug}/"
  local_route = english_route
  doc = document("series/#{slug}/index.html")
  image = doc.at_css('meta[property="og:image"]')&.[]("content") || doc.at_css("main img")&.[]("src")
  cards = doc.css(".work-card").map { |card| localized_work_card(card) }.join
  modal = localized_modal(doc.css(".gallery-grid img").first)
  <<~HTML
    #{page_head(title: "#{record.fetch("title")}攝影系列", description: record.fetch("summary"), english_route: english_route, local_route: local_route, image: image, type: "CollectionPage")}
    <body><a class="skip-link" href="#main">跳至系列</a>#{navigation(english_route, local_route, current: "series")}
    <main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">#{esc(record.fetch("dates"))}</p><h1>#{esc(record.fetch("title"))}</h1><p class="hero-copy">#{esc(record.fetch("summary"))}</p></div></section>
    <section class="section"><div class="wrap split start"><div><p class="section-label">藝術家自述</p><p class="statement">#{esc(record.fetch("title"))}</p></div><div><p class="prose">#{esc(record.fetch("summary"))}</p><p class="prose">這個系列以影像之間的關係為核心，而不是把獎項或器材當成觀看起點。個別作品頁保留完整構圖、作品文字與查詢狀態；策展、出版或收藏安排會按具體作品和用途確認。</p></div></div></section>
    <section class="section section-warm"><div class="wrap"><div class="section-head"><div><p class="section-label">系列作品</p><h2>完整構圖與固定作品記錄。</h2></div><p class="lead">每張照片均連到同一語言的完整作品頁，保留影像脈絡和查詢資料。</p></div><div class="gallery-grid">#{cards}</div></div></section>
    <section class="section"><div class="wrap notes-grid"><article class="note"><h3>收藏</h3><p>工作室會按作品確認版數、尺寸、媒介、證書、價格與交付安排。</p></article><article class="note"><h3>展覽與策展</h3><p>請提供場地、日期、主題、所需作品及技術條件，以便評估可行性。</p></article><article class="note"><h3>圖片授權</h3><p>出版、編輯、教育或商業使用須按媒體、地區、期限和修改方式書面授權。</p></article></div></section></main>
    #{modal}
    #{footer(english_route, local_route)}
  HTML
end

def project_page(slug, record)
  english_route = "/projects/#{slug}/"
  local_route = english_route
  doc = document("projects/#{slug}/index.html")
  image = doc.at_css('meta[property="og:image"]')&.[]("content") || doc.at_css("main img")&.[]("src")
  facts = record.fetch("facts").map { |fact| "<li>#{esc(fact)}</li>" }.join
  external = doc.css('a[href^="http"]').map { |link| link["href"] }.uniq.first(6).map do |href|
    %(<li><a href="#{esc(href)}" rel="noopener noreferrer">查看機構或公開原始資料</a></li>)
  end.join
  <<~HTML
    #{page_head(title: record.fetch("title"), description: record.fetch("summary"), english_route: english_route, local_route: local_route, image: image, type: "CollectionPage")}
    <body><a class="skip-link" href="#main">跳至項目</a>#{navigation(english_route, local_route, current: "projects")}
    <main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">#{esc(record.fetch("label"))}</p><h1>#{esc(record.fetch("title"))}</h1><p class="hero-copy">#{esc(record.fetch("summary"))}</p></div></section>
    <section class="section"><div class="wrap split start"><div><p class="section-label">項目背景</p><p class="statement">#{esc(record.fetch("summary"))}</p></div><div><p class="prose">#{esc(record.fetch("text"))}</p><ul class="meta-list">#{facts}</ul>#{external.empty? ? "" : %(<ul class="link-list">#{external}</ul>)}</div></div></section>
    <section class="section section-warm"><div class="wrap"><div class="section-head"><div><p class="section-label">項目影像</p><h2>保留原項目的完整圖片。</h2></div><p class="lead">縮圖以完整比例顯示；展覽、出版及授權檔案會按具體用途另行提供。</p></div><div class="proof-grid">#{project_gallery(doc, record.fetch("title"))}</div></div></section>
    <section class="section"><div class="wrap notes-grid"><article class="note"><h3>策展與展覽</h3><p>請提供場地、展期、策展主題、作品選擇與技術要求。</p></article><article class="note"><h3>出版與授權</h3><p>請列明圖片、媒體、地區、期限、發行量、修改方式與截稿日期。</p></article><article class="note"><h3>作品收藏</h3><p>如個別作品開放收藏，工作室會書面確認版本、尺寸、媒介、證書與價格。</p></article></div><div class="button-row"><a class="button" href="/zh-hant/contact/?type=exhibition#inquiry-form">提出策展或展覽查詢</a><a class="button" href="/zh-hant/licensing/">查詢圖片授權</a></div></section></main>
    #{footer(english_route, local_route)}
  HTML
end

def works_index
  english_route = "/selected-works/"
  local_route = "/works/"
  doc = document("selected-works/index.html")
  image = doc.at_css('meta[property="og:image"]')&.[]("content") || doc.at_css("main img")&.[]("src")
  cards = doc.css(".work-card").map { |card| localized_work_card(card) }.join
  <<~HTML
    #{page_head(title: "郭文棣精選攝影作品", description: "郭文棣 Ricky Kwok 的精選攝影作品，包括城市之光、儀式、動態與碰撞系列；每張作品連到完整中文記錄。", english_route: english_route, local_route: local_route, image: image, type: "CollectionPage")}
    <body><a class="skip-link" href="#main">跳至作品</a>#{navigation(english_route, local_route, current: "works")}
    <main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">精選作品</p><h1>由香港夜光到高速碰撞的完整作品入口。</h1><p class="hero-copy">每張影像均以完整構圖呈現，並連到繁體中文作品記錄；作品頁保留影像解讀、系列關係及收藏、展覽或授權路徑。</p></div></section>
    <section class="section section-warm"><div class="wrap"><div class="section-head"><div><p class="section-label">作品選輯</p><h2>先看作品，再讀脈絡。</h2></div><p class="lead">作品不是按獎項排列，而是按影像之間的視覺與概念關係排列。</p></div><div class="gallery-grid">#{cards}</div></div></section>
    <section class="section"><div class="wrap notes-grid"><article class="note"><h3>收藏</h3><p>先選作品，再由工作室確認版本、尺寸、媒介、證書、價格及交付安排。</p></article><article class="note"><h3>展覽</h3><p>策展查詢可提供場地、日期、主題、作品清單及技術需要。</p></article><article class="note"><h3>圖片授權</h3><p>出版、編輯、教育或商業使用均需按用途取得書面同意。</p></article></div></section></main>
    #{footer(english_route, local_route)}
  HTML
end

def series_index
  english_route = "/series/"
  local_route = "/series/"
  image = document("series/index.html").at_css('meta[property="og:image"]')&.[]("content")
  cards = SERIES.map do |slug, record|
    doc = document("series/#{slug}/index.html")
    card_image = doc.at_css('meta[property="og:image"]')&.[]("content") || doc.at_css("main img")&.[]("src")
    <<~HTML
      <article class="source-card">#{image_tag(Nokogiri::HTML.fragment(%(<img src="#{esc(card_image)}">)).at_css("img"), alt: "#{record.fetch("title")}系列代表影像")}<div class="source-body"><p class="section-label">#{esc(record.fetch("dates"))}</p><h3>#{esc(record.fetch("title"))}</h3><p>#{esc(record.fetch("summary"))}</p><ul class="link-list"><li><a href="/zh-hant/series/#{slug}/">進入完整系列</a></li></ul></div></article>
    HTML
  end.join
  <<~HTML
    #{page_head(title: "郭文棣攝影系列", description: "儀式、碰撞、動態及城市之光：郭文棣四個主要攝影系列的繁體中文完整入口。", english_route: english_route, local_route: local_route, image: image, type: "CollectionPage")}
    <body><a class="skip-link" href="#main">跳至系列</a>#{navigation(english_route, local_route, current: "series")}<main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">四個主要系列</p><h1>每個系列只負責一套清晰的視覺語言。</h1><p class="hero-copy">Ritual、Collision、Motion 與 City Light 各自擁有完整中文自述、作品選輯和查詢路徑。</p></div></section><section class="section section-warm"><div class="wrap"><div class="source-grid">#{cards}</div></div></section></main>#{footer(english_route, local_route)}
  HTML
end

def projects_index
  english_route = "/projects/"
  local_route = "/projects/"
  image = document("projects/index.html").at_css('meta[property="og:image"]')&.[]("content")
  cards = PROJECTS.map do |slug, record|
    doc = document("projects/#{slug}/index.html")
    card_image = doc.at_css('meta[property="og:image"]')&.[]("content") || doc.at_css("main img")&.[]("src")
    node = Nokogiri::HTML.fragment(%(<img src="#{esc(card_image)}">)).at_css("img")
    <<~HTML
      <article class="source-card">#{image_tag(node, alt: "#{record.fetch("title")}代表影像")}<div class="source-body"><p class="section-label">#{esc(record.fetch("label"))}</p><h3>#{esc(record.fetch("title"))}</h3><p>#{esc(record.fetch("summary"))}</p><ul class="link-list"><li><a href="/zh-hant/projects/#{slug}/">閱讀完整項目</a></li></ul></div></article>
    HTML
  end.join
  <<~HTML
    #{page_head(title: "郭文棣攝影項目", description: "香港光污染、魚塘保育、尼泊爾紀實、紅外線香港、賽馬與中國紀實攝影項目。", english_route: english_route, local_route: local_route, image: image, type: "CollectionPage")}
    <body><a class="skip-link" href="#main">跳至項目</a>#{navigation(english_route, local_route, current: "projects")}<main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">攝影項目</p><h1>由地方、研究與持續觀看形成的作品。</h1><p class="hero-copy">每個項目均保留背景、影像、可核實資料與展覽、出版、收藏或授權路徑。</p></div></section><section class="section section-warm"><div class="wrap"><div class="source-grid">#{cards}</div></div></section></main>#{footer(english_route, local_route)}
  HTML
end

def core_page(route, record)
  english_route = "/#{route}/"
  local_route = english_route
  source = document("#{route}/index.html")
  image = record.fetch("image")
  sections = record.fetch("sections").each_with_index.map do |section, index|
    paragraphs = section.fetch("paragraphs").map { |paragraph| %(<p class="prose">#{esc(paragraph)}</p>) }.join
    tone = index.odd? ? " section-warm" : ""
    <<~HTML
      <section class="section#{tone}"><div class="wrap split start"><div><p class="section-label">#{esc(record.fetch("label"))}</p><p class="statement">#{esc(section.fetch("heading"))}</p></div><div>#{paragraphs}</div></div></section>
    HTML
  end.join
  links = record.fetch("links", []).map { |label, href| %(<a class="button" href="#{esc(href)}">#{esc(label)}</a>) }.join
  seen = {}
  source_images = source.css("main img").each_with_object([]) do |node, selected|
    src = node["src"]
    next if src.to_s.empty? || seen[src]
    seen[src] = true
    selected << node
  end.first(6)
  gallery = if source_images.empty?
              ""
            else
              cards = source_images.each_with_index.map do |node, index|
                <<~HTML
                  <figure class="proof-card">#{image_tag(node, alt: "#{record.fetch("title")}資料影像 #{index + 1}")}<figcaption class="proof-body"><p>#{esc(record.fetch("title"))}・資料影像 #{index + 1}</p></figcaption></figure>
                HTML
              end.join
              %(<section class="section section-warm"><div class="wrap"><div class="section-head"><div><p class="section-label">核准預覽</p><h2>相關圖像與資料。</h2></div><p class="lead">網頁檔案只供審閱；出版、展覽或商業使用須另行取得書面同意。</p></div><div class="proof-grid">#{cards}</div></div></section>)
            end
  current = if route.start_with?("press")
              "press"
            elsif route.start_with?("contact")
              "contact"
            elsif route == "artist-statement"
              "about"
            end
  type = route == "press/cv" ? "ProfilePage" : "WebPage"
  core_schema = type == "ProfilePage" ? { "mainEntity" => { "@type" => "Person", "@id" => "#{ORIGIN}/#person", "name" => "Ricky Kwok 郭文棣" } } : {}
  award_chronology = if route == "press/cv"
                       %(<section class="section section-warm"><div class="wrap"><div class="section-head"><div><p class="section-label">完整公開獎項紀錄</p><h2>十七項來源連結結果。</h2></div><p class="lead">ARPS 另列為專業殊榮。每項結果保留年份、組別、準確結果名稱、作品及公開來源。</p></div><ul class="award-list">#{award_rows}</ul></div></section>)
                     else
                       ""
                     end
  <<~HTML
    #{page_head(title: record.fetch("title"), description: record.fetch("summary"), english_route: english_route, local_route: local_route, image: image, type: type, schema: core_schema, indexable: !record["noindex"])}
    <body><a class="skip-link" href="#main">跳至主要內容</a>#{navigation(english_route, local_route, current: current)}
    <main id="main"><section class="hero page-hero" style="--hero-image:url('#{esc(image)}')"><div class="hero-inner"><p class="eyebrow">#{esc(record.fetch("label"))}</p><h1>#{esc(record.fetch("title"))}</h1><p class="hero-copy">#{esc(record.fetch("summary"))}</p></div></section>#{sections}#{award_chronology}#{gallery}<section class="section"><div class="wrap"><div class="button-row">#{links}</div></div></section></main>
    #{footer(english_route, local_route)}
  HTML
end

def award_rows
  seen_years = {}
  AWARDS.map do |record|
    year = record.fetch("year").to_s
    id = seen_years[year] ? "" : %( id="year-#{year}")
    seen_years[year] = true
    <<~HTML
      <li#{id}><time>#{esc(year)}</time><span><strong>#{esc(record.fetch("result"))}</strong><br>#{esc(record.fetch("note"))} <small><a href="#{esc(record.fetch("source"))}" target="_blank" rel="noopener noreferrer">#{esc(record.fetch("label"))}</a></small></span></li>
    HTML
  end.join
end

def awards_page
  english_route = "/awards-recognition/"
  local_route = "/awards/"
  image = "/assets/optimized-v2/art/light-encroached-homes-1280.webp"
  item_list = AWARDS.each_with_index.map do |record, index|
    { "@type" => "ListItem", "position" => index + 1, "name" => record.fetch("result"), "url" => record.fetch("source") }
  end
  schema = { "mainEntity" => { "@type" => "ItemList", "numberOfItems" => AWARDS.size, "itemListElement" => item_list } }
  <<~HTML
    #{page_head(title: "郭文棣 Ricky Kwok 獎項及認可", description: "郭文棣 Ricky Kwok 的來源連結攝影獎項紀錄，分開列出 ARPS 專業殊榮與十七項公開比賽結果。", english_route: english_route, local_route: local_route, image: image, type: "CollectionPage", schema: schema)}
    <body><a class="skip-link" href="#main">跳至獎項紀錄</a>#{navigation(english_route, local_route, current: "about")}
    <main id="main"><section class="hero page-hero" style="--hero-image:url('#{image}')"><div class="hero-inner"><p class="eyebrow">獎項、來源與準確措辭</p><h1>只公開可被清楚追溯的結果。</h1><p class="hero-copy">專業殊榮與攝影比賽分開；每項紀錄保留年份、組別、結果名稱、作品及主辦機構或同期公開來源，不使用未審核的「100+」總數。</p></div></section>
    <section class="section section-warm"><div class="wrap split start"><div class="inquiry-panel" id="professional-distinction"><p class="section-label">專業殊榮</p><strong>Associate of the Royal Photographic Society — ARPS</strong><p>ARPS 是英國皇家攝影學會的 Associate distinction，可列於藝術家姓名之後；它不是比賽冠軍，也不計入以下攝影比賽結果。</p></div><div class="notes-grid"><article class="note"><h3>官方核實</h3><p>主辦或機構網站直接公布姓名、組別與結果。</p></article><article class="note"><h3>同期紀錄</h3><p>主辦結果頁已無法取得時，清楚標示當時可信報道，而不冒充官方來源。</p></article><article class="note"><h3>準確措辭</h3><p>Commended、Merit、Champion、亞軍與季軍均按原紀錄書寫，不升級成更高獎項。</p></article><article class="note"><h3>暫不公開</h3><p>未有清楚結果、證書或目錄支持的舊稱號，保留在私人證據帳本，不混入已核實清單。</p></article></div></div></section>
    <section class="section"><div class="wrap"><div class="section-head"><div><p class="section-label">完整來源連結紀錄</p><h2>十七項結果，來自十四個比賽活動。</h2></div><p class="lead">2014「香港有漁塘」屬同一活動內四項獨立名次。早期紀錄可能以郭文棣或 Kwok Man Tai 出現；公開學校及主辦資料把名稱連至同一位攝影師。</p></div><ul class="award-list">#{award_rows}</ul></div></section>
    <section class="section"><div class="wrap"><div class="section-head"><div><p class="section-label">作品與機構證據</p><h2>獎項應連回實際作品。</h2></div><p class="lead">兩個有完整公開紀錄的香港項目，展示作品、結果與機構來源如何在同一頁互相支持。</p></div><div class="source-grid"><article class="source-card"><img src="/assets/optimized-v2/art/light-encroached-homes-1200.webp" alt="《光染民居》，旺角，2014" loading="lazy" decoding="async" width="1280" height="831"><div class="source-body"><h3>香港大學光污染攝影比賽</h3><p>冠軍；154 份參賽作品；其後於香港太空館展出。</p><ul class="link-list"><li><a href="/zh-hant/projects/hong-kong-light-pollution/">查看作品、拍攝經過與官方來源</a></li></ul></div></article><article class="source-card"><img src="/assets/optimized-v2/art/fishpond-harvest-1000.webp" alt="《漁獲》，香港魚塘，2014" loading="lazy" decoding="async" width="1000" height="649"><div class="source-body"><h3>香港有漁塘攝影比賽</h3><p>同一活動內四項學生組風景及生態名次，分別按官方結果列示。</p><ul class="link-list"><li><a href="/zh-hant/projects/hong-kong-fishpond-conservation/">查看四張作品與香港觀鳥會來源</a></li></ul></div></article></div></div></section>
    <section class="section section-warm"><div class="wrap split start"><div><p class="section-label">證據治理</p><p class="statement">來源先於宣傳。</p></div><div><p class="prose">PX3、埃及國際攝影比賽、部分國際沙龍、HSBC、Huawei、HKQAA 及其他舊紀錄，只有在證書、主辦結果或足以確定組別和名次的正式文件附上後，才會加入公開核實清單。這個做法避免搜尋引擎、媒體或人工智能系統重複不完整聲稱。</p><div class="button-row"><a class="button dark" href="/zh-hant/press/cv/">查看完整履歷</a><a class="button ghost-dark" href="/zh-hant/contact/?type=press#inquiry-form">媒體核實查詢</a></div></div></div></section></main>
    #{footer(english_route, local_route)}
  HTML
end

def redirect_page(route, target)
  english_route = "/#{route}/"
  local_route = english_route
  destination = "/zh-hant#{target}"
  canonical = "#{ORIGIN}#{destination.sub(/#.*$/, "")}"
  <<~HTML
    <!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>頁面已整合｜郭文棣 Ricky Kwok</title><meta name="description" content="此舊網址已整合至相應的繁體中文權威頁面。"><link rel="canonical" href="#{canonical}"><link rel="alternate" hreflang="en" href="#{ORIGIN}#{english_route}"><link rel="alternate" hreflang="zh-Hant" href="#{ORIGIN}#{destination}"><link rel="alternate" hreflang="zh-Hans" href="#{ORIGIN}#{destination.sub("/zh-hant/", "/zh-hans/")}"><meta http-equiv="refresh" content="0; url=#{destination}"><link rel="stylesheet" href="/assets/site.min.css"><script>location.replace(#{destination.to_json});</script></head><body class="redirect-page"><main class="redirect-card"><p class="eyebrow">頁面整合</p><h1>內容已移至更清晰的中文頁面。</h1><p class="prose">網站已把重複分類整合至一個權威目的地，避免讀者在相近頁面之間迷失。</p><div class="button-row"><a class="button" href="#{destination}">前往整合後頁面</a></div>#{language_switcher(english_route, local_route)}</main></body></html>
  HTML
end

ARTWORKS.each { |slug, record| write_page("zh-hant/works/#{slug}", artwork_page(slug, record)) } if generate?("artworks")
COLLECTIONS.each { |slug, record| write_page("zh-hant/works/#{slug}", collection_page(slug, record)) } if generate?("collections")
SERIES.each { |slug, record| write_page("zh-hant/series/#{slug}", series_page(slug, record)) } if generate?("series")
write_page("zh-hant/works", works_index) if generate?("works-index")
write_page("zh-hant/series", series_index) if generate?("series-index")
write_page("zh-hant/projects", projects_index) if generate?("projects-index")
PROJECTS.each { |slug, record| write_page("zh-hant/projects/#{slug}", project_page(slug, record)) } if generate?("projects")
CORE.each { |route, record| write_page("zh-hant/#{route}", core_page(route, record)) } if generate?("core")
write_page("zh-hant/awards", awards_page) if generate?("awards")
ALIASES.each { |route, target| write_page("zh-hant/#{route}", redirect_page(route, target)) } if generate?("aliases")

puts "Generated #{ARTWORKS.size + COLLECTIONS.size + SERIES.size + PROJECTS.size + CORE.size + 3} substantive Traditional Chinese pages and #{ALIASES.size} consolidated redirects."
