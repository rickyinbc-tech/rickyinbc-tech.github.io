#!/usr/bin/env ruby
# frozen_string_literal: true

# Keeps the public artwork record internally consistent. The manifest is the
# source of truth for the one image Google Images should associate with each
# artwork. It intentionally omits unknown commercial and production facts.

require "cgi"
require "json"
require "nokogiri"

ROOT = File.expand_path("../..", __dir__)
ORIGIN = "https://rickykwok.com"
MANIFEST = JSON.parse(File.read(File.join(ROOT, ".github/data/artwork-manifest.json")))
ARTWORKS = MANIFEST.fetch("artworks")
RIGHTS = MANIFEST.fetch("rights")

LOCALES = {
  "en" => {
    prefix: "", path_prefix: "", label: "View artwork", zoom: "Open full composition",
    artist_label: "Artist", type_label: "Artwork type", type_value: "Photograph",
    copyright_label: "Copyright", copyright_value: "© Ricky Kwok. Written permission is required for reproduction.",
    acquisition_label: "Acquisition", acquisition_value: "Format, edition, price, availability, production and delivery are confirmed in a written studio offer.",
    licensing_label: "Licensing", licensing_value: "Scope, fee, credit, file specifications and approval conditions are confirmed in a written license.",
    acquisition_cta: "Ask about acquisition", licensing_cta: "Request image licensing", exhibition_cta: "Propose an exhibition",
    standards_label: "Studio Standards", standards_path: "/studio-standards/", selected_path: "/selected-works/"
  },
  "zh-Hant" => {
    prefix: "/zh-hant", path_prefix: "zh-hant/", label: "查看完整作品", zoom: "放大檢視完整構圖",
    artist_label: "藝術家", type_label: "作品類型", type_value: "攝影作品",
    copyright_label: "版權", copyright_value: "© 郭文棣 Ricky Kwok。任何複製或使用均須事先取得書面許可。",
    acquisition_label: "收藏", acquisition_value: "作品形式、版本、價格、供應狀態、製作及運送安排，均以工作室書面要約為準。",
    licensing_label: "授權", licensing_value: "使用範圍、費用、署名、檔案規格及審批條件，均以書面授權協議為準。",
    acquisition_cta: "查詢作品收藏", licensing_cta: "申請圖片授權", exhibition_cta: "提出展覽合作",
    standards_label: "工作室標準", standards_path: "/zh-hant/studio-standards/", selected_path: "/zh-hant/works/"
  },
  "zh-Hans" => {
    prefix: "/zh-hans", path_prefix: "zh-hans/", label: "查看完整作品", zoom: "放大查看完整构图",
    artist_label: "艺术家", type_label: "作品类型", type_value: "摄影作品",
    copyright_label: "版权", copyright_value: "© 郭文棣 Ricky Kwok。任何复制或使用均须事先取得书面许可。",
    acquisition_label: "收藏", acquisition_value: "作品形式、版本、价格、供应状态、制作及运送安排，均以工作室书面要约为准。",
    licensing_label: "授权", licensing_value: "使用范围、费用、署名、文件规格及审批条件，均以书面授权协议为准。",
    acquisition_cta: "查询作品收藏", licensing_cta: "申请图片授权", exhibition_cta: "提出展览合作",
    standards_label: "工作室标准", standards_path: "/zh-hans/studio-standards/", selected_path: "/zh-hans/works/"
  }
}.freeze

ARTWORK_BY_ID = ARTWORKS.to_h { |artwork| [artwork.fetch("id"), artwork] }.freeze

def esc(value)
  CGI.escapeHTML(value.to_s)
end

def absolute(path)
  path.to_s.start_with?("http") ? path.to_s : "#{ORIGIN}#{path}"
end

def local_file(path)
  File.join(ROOT, path.sub(%r{^/}, ""))
end

def write_document(file, document)
  File.write(file, document.to_html.gsub(/[ \t]+$/, ""))
end

def public_path(path)
  return path if path.to_s.start_with?("/")

  "/#{path}"
end

def artwork_image_id(artwork)
  "#{absolute(artwork.fetch("primaryImage").fetch("url"))}#image"
end

def artwork_entity_id(artwork)
  "#{ORIGIN}/#artwork-#{artwork.fetch("id")}" 
end

def route_for(artwork, locale)
  "#{LOCALES.fetch(locale).fetch(:prefix)}#{artwork.fetch("canonicalPath")}".gsub(%r{//+}, "/")
end

def encoded(value)
  CGI.escape(value.to_s).gsub("+", "%20")
end

def localized_studio_path(locale, path)
  "#{LOCALES.fetch(locale).fetch(:prefix)}#{path}".gsub(%r{//+}, "/")
end

def pathway_row(document, artwork, locale)
  settings = LOCALES.fetch(locale)
  title = title_for(document, artwork, locale)
  title_param = encoded(title)
  contact_path = localized_studio_path(locale, "/contact/")
  licensing_path = localized_studio_path(locale, "/licensing/")
  Nokogiri::HTML.fragment(<<~HTML).at_css(".button-row")
    <div class="button-row artwork-cta-row" data-artwork-pathways>
      <a class="button" href="#{contact_path}?type=print&amp;artwork=#{title_param}#inquiry-form">#{settings.fetch(:acquisition_cta)}</a>
      <a class="button" href="#{licensing_path}?artwork=#{title_param}#licensing-form">#{settings.fetch(:licensing_cta)}</a>
      <a class="button" href="#{contact_path}?type=exhibition&amp;artwork=#{title_param}#inquiry-form">#{settings.fetch(:exhibition_cta)}</a>
    </div>
  HTML
end

def metadata_label(item)
  item.at_css("strong")&.text.to_s.sub(/[：:]\s*\z/, "").strip
end

def append_metadata_item(document, list, label, value, link: nil)
  item = Nokogiri::XML::Node.new("li", document)
  strong = Nokogiri::XML::Node.new("strong", document)
  strong.content = "#{label}:"
  item.add_child(strong)
  item.add_child(Nokogiri::XML::Text.new(" #{value}", document))
  if link
    item.add_child(Nokogiri::XML::Text.new(" ", document))
    item.add_child(link)
  end
  list.add_child(item)
end

def sync_artwork_governance(document, artwork, locale)
  settings = LOCALES.fetch(locale)
  hero_inner = document.at_css("main .hero .hero-inner")
  if hero_inner
    existing = hero_inner.element_children.find { |child| child["class"].to_s.split.include?("button-row") }
    row = pathway_row(document, artwork, locale)
    existing ? existing.replace(row) : hero_inner.add_child(row)
  end

  # Remove legacy generic inquiry links from the facts section. The hero now
  # exposes the same three governed pathways on every artwork record.
  details_section = document.css("main .section").find { |section| section.at_css(".artwork-meta") }
  details_section&.css(".button-row a").to_a.each do |link|
    href = link["href"].to_s
    link.remove if href.include?("/contact/") || href.include?("/licensing/")
  end
  details_section&.css(".button-row").to_a.each { |row| row.remove if row.css("a").empty? }

  list = document.at_css(".artwork-meta")
  return unless list

  governed_labels = LOCALES.values.flat_map do |values|
    [values[:copyright_label], values[:acquisition_label], values[:licensing_label]]
  end.compact + ["Status", "狀態", "状态"]
  list.element_children.select { |item| item.name == "li" }.each { |item| item.remove if governed_labels.include?(metadata_label(item)) }

  labels = list.element_children.select { |item| item.name == "li" }.map { |item| metadata_label(item) }
  append_metadata_item(document, list, settings.fetch(:artist_label), "Ricky Kwok / 郭文棣 / Kwok Man Tai") unless labels.include?(settings.fetch(:artist_label))
  append_metadata_item(document, list, settings.fetch(:type_label), settings.fetch(:type_value)) unless labels.include?(settings.fetch(:type_label))
  append_metadata_item(document, list, settings.fetch(:copyright_label), settings.fetch(:copyright_value))
  standards_link = Nokogiri::XML::Node.new("a", document)
  standards_link["href"] = settings.fetch(:standards_path)
  standards_link.content = settings.fetch(:standards_label)
  append_metadata_item(document, list, settings.fetch(:acquisition_label), settings.fetch(:acquisition_value), link: standards_link)
  append_metadata_item(document, list, settings.fetch(:licensing_label), settings.fetch(:licensing_value))
  list["data-artwork-governance"] = "v2"
end

def file_for(artwork, locale)
  File.join(ROOT, LOCALES.fetch(locale).fetch(:path_prefix), artwork.fetch("canonicalPath").sub(%r{^/}, ""), "index.html")
end

def title_for(document, artwork, locale)
  title = document.at_css("main h1")&.text&.gsub(/\s+/, " ")&.strip
  return artwork.fetch("title") if title.nil? || title.empty? || locale == "en" && title.length < 2

  title
end

def localized_alt(document, artwork, locale)
  return artwork.fetch("alt") if locale == "en"

  composition_label = locale == "zh-Hans" ? "完整构图" : "完整構圖"
  "郭文棣作品《#{title_for(document, artwork, locale)}》#{composition_label}"
end

def responsive_webp_srcset(existing, artwork)
  return existing unless existing.to_s.empty?

  base = File.basename(artwork.fetch("primaryImage").fetch("url"), ".jpg")
  files = Dir.glob(File.join(ROOT, "assets/optimized-v2/art/#{base}-*.webp"))
  records = files.map do |file|
    width = File.basename(file)[/-(\d+)\.webp\z/, 1]
    next unless width

    [width.to_i, "/#{file.delete_prefix(ROOT + "/")}"]
  end.compact.sort_by(&:first)
  records.map { |width, path| "#{path} #{width}w" }.join(", ")
end

def responsive_avif_srcset(artwork)
  base = File.basename(artwork.fetch("primaryImage").fetch("url"), ".jpg")
  files = Dir.glob(File.join(ROOT, "assets/optimized-v2/art/#{base}-*.avif"))
  records = files.map do |file|
    width = File.basename(file)[/-(\d+)\.avif\z/, 1]
    next unless width

    [width.to_i, "/#{file.delete_prefix(ROOT + "/")}"]
  end.compact.sort_by(&:first)
  records.map { |width, path| "#{path} #{width}w" }.join(", ")
end

def image_for_manifest(node, artwork, locale, document)
  return unless node

  primary = artwork.fetch("primaryImage")
  node["src"] = primary.fetch("url")
  node["width"] = primary.fetch("width").to_s
  node["height"] = primary.fetch("height").to_s
  node["alt"] = localized_alt(document, artwork, locale)
  node["loading"] = "lazy"
  node["decoding"] = "async"
  node.remove_attribute("fetchpriority")
  webp = responsive_webp_srcset(node["srcset"], artwork)
  if webp.empty?
    node.remove_attribute("srcset")
  else
    node["srcset"] = webp
  end
  node
end

def add_caption(document, image_container, artwork)
  parent = image_container.parent
  caption = artwork.fetch("caption")
  if parent&.name == "figure"
    node = parent.at_css("figcaption") || Nokogiri::XML::Node.new("figcaption", document)
    node["class"] = "artwork-caption"
    node.content = caption
    parent.add_child(node) unless node.parent
    return
  end

  sibling = image_container.next_element
  if sibling&.[]("class").to_s.split.include?("artwork-caption")
    sibling.content = caption
    return
  end
  node = Nokogiri::XML::Node.new("p", document)
  node["class"] = "artwork-caption"
  node.content = caption
  image_container.add_next_sibling(node)
end

def hero_media(document, artwork, locale, source_image)
  hero = document.at_css("main .hero")
  return unless hero

  primary = artwork.fetch("primaryImage")
  hero["class"] = [hero["class"], "has-semantic-media"].compact.join(" ").split.uniq.join(" ")
  hero.remove_attribute("style")
  hero.children.select do |child|
    child.element? && child["class"].to_s.split.any? { |name| %w[hero-media hero-overlay].include?(name) }
  end.each(&:remove)

  webp = responsive_webp_srcset(source_image&.[]("srcset"), artwork)
  avif = responsive_avif_srcset(artwork)
  alt = localized_alt(document, artwork, locale)
  sources = []
  sources << %(<source type="image/avif" srcset="#{esc(avif)}" sizes="100vw">) unless avif.empty?
  sources << %(<source type="image/webp" srcset="#{esc(webp)}" sizes="100vw">) unless webp.empty?
  picture = Nokogiri::HTML.fragment(<<~HTML).at_css("picture")
    <picture class="hero-media">
      #{sources.join("\n")}
      <img src="#{esc(primary.fetch("url"))}" width="#{primary.fetch("width")}" height="#{primary.fetch("height")}" alt="#{esc(alt)}" sizes="100vw" loading="eager" decoding="async" fetchpriority="high">
    </picture>
  HTML
  overlay = Nokogiri::HTML.fragment('<span class="hero-overlay" aria-hidden="true"></span>').at_css("span")
  hero.prepend_child(overlay)
  hero.prepend_child(picture)
end

def replace_artwork_schema(document, artwork, locale)
  document.css('script[type="application/ld+json"]').remove
  page_url = absolute(route_for(artwork, locale))
  english_url = absolute(artwork.fetch("canonicalPath"))
  primary = artwork.fetch("primaryImage")
  page_title = title_for(document, artwork, locale)
  description = document.at_css('meta[name="description"]')&.[]("content").to_s
  language = locale
  image_id = artwork_image_id(artwork)
  visual = {
    "@type" => "VisualArtwork",
    "@id" => artwork_entity_id(artwork),
    "name" => artwork.fetch("title"),
    "url" => english_url,
    "creator" => { "@id" => "#{ORIGIN}/#person" },
    "artform" => "Photography",
    "image" => { "@id" => image_id },
    "copyrightHolder" => { "@id" => "#{ORIGIN}/#person" },
    "copyrightNotice" => RIGHTS.fetch("copyrightNotice")
  }
  visual["alternateName"] = page_title unless page_title == artwork.fetch("title")
  visual["dateCreated"] = artwork["dateCreated"] if artwork["dateCreated"]
  visual["contentLocation"] = { "@type" => "Place", "name" => artwork["contentLocation"] } if artwork["contentLocation"]
  visual["award"] = artwork["recognition"] if artwork["recognition"]
  if artwork["seriesPath"]
    visual["isPartOf"] = { "@type" => "CreativeWorkSeries", "name" => artwork.fetch("series"), "url" => absolute(artwork.fetch("seriesPath")) }
  elsif artwork["projectPath"]
    visual["isPartOf"] = { "@type" => "CreativeWork", "name" => artwork.fetch("series"), "url" => absolute(artwork.fetch("projectPath")) }
  end
  graph = {
    "@context" => "https://schema.org",
    "@graph" => [
      {
        "@type" => "BreadcrumbList",
        "itemListElement" => [
          { "@type" => "ListItem", "position" => 1, "name" => "Home", "item" => absolute(LOCALES.fetch(locale).fetch(:prefix) + "/") },
          { "@type" => "ListItem", "position" => 2, "name" => locale == "en" ? "Selected Works" : "作品", "item" => absolute(locale == "en" ? "/selected-works/" : "#{LOCALES.fetch(locale).fetch(:prefix)}/works/") },
          { "@type" => "ListItem", "position" => 3, "name" => page_title, "item" => page_url }
        ]
      },
      {
        "@type" => "WebPage",
        "@id" => "#{page_url}#webpage",
        "url" => page_url,
        "name" => page_title,
        "description" => description,
        "inLanguage" => language,
        "dateModified" => "2026-07-13",
        "mainEntity" => { "@id" => artwork_entity_id(artwork) },
        "primaryImageOfPage" => { "@id" => image_id }
      },
      visual,
      {
        "@type" => "ImageObject",
        "@id" => image_id,
        "name" => artwork.fetch("title"),
        "caption" => artwork.fetch("caption"),
        "contentUrl" => absolute(primary.fetch("url")),
        "encodingFormat" => primary.fetch("mimeType"),
        "width" => primary.fetch("width"),
        "height" => primary.fetch("height"),
        "creator" => { "@id" => "#{ORIGIN}/#person" },
        "creditText" => RIGHTS.fetch("creditText"),
        "copyrightHolder" => { "@id" => "#{ORIGIN}/#person" },
        "copyrightNotice" => RIGHTS.fetch("copyrightNotice"),
        "license" => absolute(RIGHTS.fetch("licensePath")),
        "acquireLicensePage" => absolute(RIGHTS.fetch("acquireLicensePath")),
        "representativeOfPage" => true
      }
    ]
  }
  script = Nokogiri::XML::Node.new("script", document)
  script["type"] = "application/ld+json"
  script.content = JSON.generate(graph)
  stylesheet = document.at_css('link[rel="stylesheet"]')
  stylesheet ? stylesheet.add_next_sibling(script) : document.at_css("head")&.add_child(script)
end

def update_social_metadata(document, artwork, locale)
  image_url = absolute(artwork.fetch("primaryImage").fetch("url"))
  alt = localized_alt(document, artwork, locale)
  {
    'meta[property="og:image"]' => image_url,
    'meta[name="twitter:image"]' => image_url,
    'meta[property="og:image:alt"]' => alt,
    'meta[property="og:updated_time"]' => "2026-07-13T00:00:00-07:00"
  }.each do |selector, value|
    node = document.at_css(selector)
    unless node
      node = Nokogiri::XML::Node.new("meta", document)
      selector.match(/\[(?:property|name)="([^"]+)"\]/)
      attribute = selector.include?("property=") ? "property" : "name"
      node[attribute] = Regexp.last_match(1)
      document.at_css("head")&.add_child(node)
    end
    node["content"] = value
  end
  document.css('link[rel="preload"][as="image"]').remove
end

def sync_artwork_page(artwork, locale)
  file = file_for(artwork, locale)
  raise "Missing artwork page: #{file}" unless File.exist?(file)

  document = Nokogiri::HTML(File.read(file))
  feature = document.at_css(".feature-image img") || document.at_css("main img")
  original_srcset = feature&.[]("srcset")
  image_for_manifest(feature, artwork, locale, document)
  feature["srcset"] = original_srcset if feature && original_srcset && !original_srcset.empty?
  add_caption(document, document.at_css(".feature-image"), artwork) if document.at_css(".feature-image")
  hero_media(document, artwork, locale, feature)
  sync_artwork_governance(document, artwork, locale)
  update_social_metadata(document, artwork, locale)
  replace_artwork_schema(document, artwork, locale)
  write_document(file, document)
end

def image_to_artwork
  ARTWORKS.each_with_object({}) do |artwork, map|
    image = artwork.fetch("primaryImage").fetch("url")
    map[image] = artwork
    base = File.basename(image, ".jpg")
    map["/assets/optimized-v2/art/#{base}-1200.webp"] = artwork
    map["/assets/optimized-v2/art/#{base}-1000.webp"] = artwork
    map["/assets/optimized-v2/art/#{base}-800.webp"] = artwork
    map["/assets/optimized-v2/art/#{base}-1280.webp"] = artwork
  end
end

def convert_series_cards
  by_image = image_to_artwork
  Dir.glob(File.join(ROOT, "series/{ritual,collision,motion,city-light}/index.html")).sort.each do |file|
    document = Nokogiri::HTML(File.read(file))
    document.css("button.work-card[data-full]").each do |card|
      artwork = by_image[card["data-full"]]
      next unless artwork

      article = Nokogiri::XML::Node.new("article", document)
      article["class"] = card["class"]
      article["data-artwork-id"] = artwork.fetch("id")
      article["data-series"] = artwork.fetch("series")
      link = Nokogiri::XML::Node.new("a", document)
      link["class"] = "work-card-link"
      link["href"] = artwork.fetch("canonicalPath")
      link["data-artwork-id"] = artwork.fetch("id")
      link["aria-label"] = "View #{artwork.fetch("title")}" 
      card.children.to_a.each { |child| link.add_child(child.unlink) }
      zoom = Nokogiri::XML::Node.new("button", document)
      zoom["class"] = "work-zoom"
      zoom["type"] = "button"
      zoom["aria-label"] = "Open full composition of #{artwork.fetch("title")}" 
      card.attribute_nodes.each do |attribute|
        zoom[attribute.name] = attribute.value if attribute.name.start_with?("data-")
      end
      zoom.content = "Zoom"
      article.add_child(link)
      article.add_child(zoom)
      card.replace(article)
    end
    write_document(file, document)
  end
end

def link_print_cards
  by_image = image_to_artwork
  { "en" => "prints/index.html", "zh-Hant" => "zh-hant/editions/index.html", "zh-Hans" => "zh-hans/editions/index.html" }.each do |locale, relative|
    file = File.join(ROOT, relative)
    next unless File.exist?(file)

    document = Nokogiri::HTML(File.read(file))
    document.css(".print-card").each do |card|
      image = card.at_css("img")
      artwork = by_image[image&.[]("src")]
      next unless artwork

      destination = route_for(artwork, locale)
      unless image.parent&.name == "a"
        link = Nokogiri::XML::Node.new("a", document)
        link["class"] = "print-image-link"
        link["href"] = destination
        link["aria-label"] = "#{LOCALES.fetch(locale).fetch(:label)}: #{title_for(document, artwork, locale)}"
        image.replace(link)
        link.add_child(image)
      end
      heading = card.at_css("h3")
      next unless heading && heading.at_css("a")&.[]("href").to_s.empty?

      link = Nokogiri::XML::Node.new("a", document)
      link["href"] = destination
      link.content = heading.text.strip
      heading.children.remove
      heading.add_child(link)
    end
    write_document(file, document)
  end
end

convert_series_cards
ARTWORKS.each { |artwork| LOCALES.keys.each { |locale| sync_artwork_page(artwork, locale) } }
link_print_cards

puts "Synchronized #{ARTWORKS.size} artwork records across #{LOCALES.size} languages, canonical image graphs, artwork-card links, and print-card links."
