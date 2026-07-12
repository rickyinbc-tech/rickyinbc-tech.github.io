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
  "en" => { prefix: "", path_prefix: "", label: "View artwork", zoom: "Open full composition" },
  "zh-Hant" => { prefix: "/zh-hant", path_prefix: "zh-hant/", label: "查看完整作品", zoom: "放大檢視完整構圖" },
  "zh-Hans" => { prefix: "/zh-hans", path_prefix: "zh-hans/", label: "查看完整作品", zoom: "放大查看完整构图" }
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
        "dateModified" => "2026-07-11",
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
    'meta[property="og:image:alt"]' => alt
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
  update_social_metadata(document, artwork, locale)
  replace_artwork_schema(document, artwork, locale)
  File.write(file, document.to_html)
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
    File.write(file, document.to_html)
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
    File.write(file, document.to_html)
  end
end

convert_series_cards
ARTWORKS.each { |artwork| LOCALES.keys.each { |locale| sync_artwork_page(artwork, locale) } }
link_print_cards

puts "Synchronized #{ARTWORKS.size} artwork records across #{LOCALES.size} languages, canonical image graphs, artwork-card links, and print-card links."
