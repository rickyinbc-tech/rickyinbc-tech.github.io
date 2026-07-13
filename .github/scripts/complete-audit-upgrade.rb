#!/usr/bin/env ruby
# frozen_string_literal: true

# One-time, idempotent migration for the July 2026 audit completion release.
# The permanent validators enforce the resulting contracts after this script runs.

require "pathname"

ROOT = Pathname.new(__dir__).join("../..").expand_path
HTML_FILES = ROOT.glob("**/index.html").reject { |file| file.to_s.include?("/.git/") }

THEMATIC_EDITS = %w[
  hong-kong-urban-light-studies
  monochrome-documentary
  sport-abstraction
  studio-collision-studies
  village-ritual-photography
].freeze

HOME_INSERTS = {
  "index.html" => [
    "Four clear ways into the practice.",
    "Five clear ways into the practice.",
    %(<article class="note"><h3><a href="/works/hong-kong-urban-light-studies/">Thematic edits</a></h3><p>Purpose-built curatorial groupings that connect works across series without creating a fifth series.</p></article>),
    %(<article class="note"><h3>Artwork records</h3>)
  ],
  "zh-hant/index.html" => [
    "四種清楚的觀看入口。",
    "五種清楚的觀看入口。",
    %(<article class="note"><h3><a href="/zh-hant/works/hong-kong-urban-light-studies/">主題編選</a></h3><p>按策展目的跨系列連結作品，但不把編選誤作第五個系列。</p></article>),
    %(<article class="note"><h3>作品記錄</h3>)
  ],
  "zh-hans/index.html" => [
    "四种清楚的观看入口。",
    "五种清楚的观看入口。",
    %(<article class="note"><h3><a href="/zh-hans/works/hong-kong-urban-light-studies/">主题编选</a></h3><p>按策展目的跨系列连接作品，但不把编选误作第五个系列。</p></article>),
    %(<article class="note"><h3>作品记录</h3>)
  ]
}.freeze

EDIT_LABELS = {
  "en" => {
    heading: "Thematic edits",
    intro: "Five focused curatorial routes connect photographs across the four principal series. These are viewing edits, not additional series.",
    link: "Open thematic edit"
  },
  "zh-hant" => {
    heading: "主題編選",
    intro: "五條策展式觀看路徑把四個主要系列中的作品互相連結。這些是觀看編選，不是新增系列。",
    link: "開啟主題編選"
  },
  "zh-hans" => {
    heading: "主题编选",
    intro: "五条策展式观看路径把四个主要系列中的作品互相连接。这些是观看编选，不是新增系列。",
    link: "开启主题编选"
  }
}.freeze

EDIT_TITLES = {
  "en" => {
    "hong-kong-urban-light-studies" => "Hong Kong Urban Light Studies",
    "monochrome-documentary" => "Monochrome Documentary",
    "sport-abstraction" => "Sport Abstraction",
    "studio-collision-studies" => "Studio Collision Studies",
    "village-ritual-photography" => "Village Ritual Photography"
  },
  "zh-hant" => {
    "hong-kong-urban-light-studies" => "香港都市光線研究",
    "monochrome-documentary" => "黑白紀實編選",
    "sport-abstraction" => "運動抽象編選",
    "studio-collision-studies" => "攝影棚碰撞研究",
    "village-ritual-photography" => "鄉村儀式攝影"
  },
  "zh-hans" => {
    "hong-kong-urban-light-studies" => "香港都市光线研究",
    "monochrome-documentary" => "黑白纪实编选",
    "sport-abstraction" => "运动抽象编选",
    "studio-collision-studies" => "摄影棚碰撞研究",
    "village-ritual-photography" => "乡村仪式摄影"
  }
}.freeze

def thematic_section(locale)
  prefix = locale == "en" ? "" : "/#{locale}"
  labels = EDIT_LABELS.fetch(locale)
  cards = THEMATIC_EDITS.map do |slug|
    title = EDIT_TITLES.fetch(locale).fetch(slug)
    %(<article class="note"><h3><a href="#{prefix}/works/#{slug}/">#{title}</a></h3><p><a href="#{prefix}/works/#{slug}/">#{labels[:link]}</a></p></article>)
  end.join("\n")
  <<~HTML
    <section class="section section-warm thematic-edits" aria-labelledby="thematic-edits-title">
      <div class="wrap">
        <div class="section-head"><div><p class="section-label">#{labels[:heading]}</p><h2 id="thematic-edits-title">#{labels[:heading]}</h2></div><p class="lead">#{labels[:intro]}</p></div>
        <div class="notes-grid">#{cards}</div>
      </div>
    </section>
  HTML
end

def responsive_data(src)
  path = src.sub(%r{^https://rickykwok\.com}, "")
  mappings = {
    "/assets/art/light-encroached-homes.jpg" => ["/assets/optimized-v2/art/light-encroached-homes", [480, 800, 1200, 1280], 1280, 831],
    "/assets/art/fishpond-harvest.jpg" => ["/assets/optimized-v2/art/fishpond-harvest", [480, 800, 1000], 1000, 649],
    "/assets/art/blue-hour-cormorant-fishermen.jpg" => ["/assets/optimized-v2/art/blue-hour-cormorant-fishermen", [480, 800], 800, 519],
    "/assets/art/cigarette-impact.jpg" => ["/assets/optimized-v2/art/cigarette-impact", [480, 800, 1200, 1280], 1280, 831],
    "/assets/art/swimming-motion.jpg" => ["/assets/optimized-v2/art/swimming-motion", [480, 800, 1200, 1280], 1280, 831],
    "/assets/behance/nepal-documentary/nepal-documentary-05.jpg" => ["/assets/optimized-v2/behance/nepal-documentary/nepal-documentary-05", [480, 800, 1200, 1600, 1800], 1800, 1201],
    "/assets/behance/infrared-hong-kong/infrared-hong-kong-02.jpg" => ["/assets/optimized-v2/behance/infrared-hong-kong/infrared-hong-kong-02", [480, 800, 1200, 1600, 1800], 1800, 1012],
    "/assets/behance/horse-riding/horse-riding-02.jpg" => ["/assets/optimized-v2/behance/horse-riding/horse-riding-02", [480, 800, 1200, 1600, 1800], 1800, 1200],
    "/assets/behance/travel/travel-08.jpg" => ["/assets/optimized-v2/behance/travel/travel-08", [480, 800, 1200, 1600, 1800], 1800, 1200],
    "/assets/optimized-v2/art/light-encroached-homes-1200.webp" => ["/assets/optimized-v2/art/light-encroached-homes", [480, 800, 1200, 1280], 1280, 831],
    "/assets/optimized-v2/art/fishpond-harvest-1000.webp" => ["/assets/optimized-v2/art/fishpond-harvest", [480, 800, 1000], 1000, 649],
    "/assets/optimized-v2/art/green-orb-water-study-1200.webp" => ["/assets/optimized-v2/art/green-orb-water-study", [480, 800, 1200, 1280], 1280, 831]
  }
  mappings[path]
end

HTML_FILES.each do |file|
  relative = file.relative_path_from(ROOT).to_s
  html = file.read

  # source is a void element in HTML; closing tags are invalid and can produce
  # inconsistent picture parsing across browsers.
  html.gsub!(%r{</source>}i, "")

  if (home = HOME_INSERTS[relative])
    html.sub!(home[0], home[1])
    html.sub!(home[3], "#{home[2]}\n          #{home[3]}") unless html.include?(home[2])
  end

  locale = if relative.start_with?("zh-hant/") then "zh-hant"
           elsif relative.start_with?("zh-hans/") then "zh-hans"
           else "en"
           end

  selected_route = { "en" => "selected-works/index.html", "zh-hant" => "zh-hant/works/index.html", "zh-hans" => "zh-hans/works/index.html" }.fetch(locale)
  if relative == selected_route && !html.include?('class="section section-warm thematic-edits"')
    html.sub!("</main>", "#{thematic_section(locale)}</main>")
  end

  if THEMATIC_EDITS.any? { |slug| relative == "#{locale == 'en' ? '' : "#{locale}/"}works/#{slug}/index.html" }
    html.sub!(/<body(?: class="artwork-page")?>/, '<body data-page-type="thematic-edit">')
    html.sub!(/<p class="eyebrow">Works \/ ([^<]+)<\/p>/, '<p class="eyebrow">Thematic Edit / \\1</p>') if locale == "en"
    html.sub!('<p class="eyebrow">主題作品組</p>', '<p class="eyebrow">主題編選</p>') if locale == "zh-hant"
    html.sub!('<p class="eyebrow">主题作品组</p>', '<p class="eyebrow">主题编选</p>') if locale == "zh-hans"
    html.gsub!(/"dateModified":"[^"]+"/, '"dateModified":"2026-07-13"')
  end

  html.gsub!(/<img\b[^>]*>/i) do |tag|
    src = tag[/\bsrc=["']([^"']+)["']/i, 1]
    updated = tag
    missing_required_image_data = !updated.match?(/\bwidth=/i) || !updated.match?(/\bheight=/i) || !updated.match?(/\bsizes=/i)
    if missing_required_image_data && (data = responsive_data(src.to_s))
      base, widths, width, height = data
      largest = widths.max
      updated.sub!(/\bsrc=["'][^"']+["']/i, %(src="#{base}-#{largest}.webp"))
      updated.sub!(/\s+srcset=["'][^"']+["']/i, "")
      srcset = widths.map { |candidate| "#{base}-#{candidate}.webp #{candidate}w" }.join(", ")
      updated.sub!(/<img\b/i, %(<img srcset="#{srcset}"))
      updated.sub!(/\s+width=["'][^"']+["']/i, "")
      updated.sub!(/\s+height=["'][^"']+["']/i, "")
      updated.sub!(/>\z/, %( width="#{width}" height="#{height}">))
    end
    updated.sub!(/>\z/, ' sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) 50vw, 33vw">') unless updated.match?(/\bsizes=/i)
    updated
  end

  file.write(html) if html != file.read
end

puts "Applied audit completion migration to #{HTML_FILES.length} HTML files."
