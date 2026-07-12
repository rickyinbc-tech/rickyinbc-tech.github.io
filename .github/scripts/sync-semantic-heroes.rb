#!/usr/bin/env ruby
# frozen_string_literal: true

# Converts CSS-only visual heroes into HTML image content with a responsive
# fallback. This script is intentionally conservative: it reuses published
# public assets and does not create a new crop or change a photographed image.

require "cgi"
require "fileutils"
require "nokogiri"
require "shellwords"

ROOT = File.expand_path("../..", __dir__)
ORIGIN = "https://rickykwok.com"
EXCLUDED = %w[.git .github assets].freeze
DIMENSIONS = {}

def esc(value)
  CGI.escapeHTML(value.to_s)
end

def absolute_or_path(value)
  value.to_s.sub(ORIGIN, "")
end

def public_asset?(value)
  value.to_s.start_with?("/assets/")
end

def local_asset(value)
  File.join(ROOT, absolute_or_path(value).sub(%r{^/}, ""))
end

def dimensions(path)
  return DIMENSIONS[path] if DIMENSIONS.key?(path)
  file = local_asset(path)
  unless File.exist?(file)
    DIMENSIONS[path] = [1280, 831]
    return DIMENSIONS[path]
  end
  result = `sips -g pixelWidth -g pixelHeight #{Shellwords.escape(file)} 2>/dev/null`
  width = result[/pixelWidth:\s*(\d+)/, 1].to_i
  height = result[/pixelHeight:\s*(\d+)/, 1].to_i
  DIMENSIONS[path] = width.positive? && height.positive? ? [width, height] : [1280, 831]
end

def hero_source(hero, document)
  style = hero["style"].to_s
  match = style.match(/--hero-image\s*:\s*url\((?:['"])?([^'"\)]+)(?:['"])?\)/i)
  return match[1] if match

  document.at_css('meta[property="og:image"]')&.[]("content")
end

def image_base(path)
  path = absolute_or_path(path)
  return nil unless path =~ %r{\A/assets/optimized-v2/(.+)/([^/]+)-(\d+)\.(?:webp|avif)\z}

  [Regexp.last_match(1), Regexp.last_match(2)]
end

def jpeg_fallback(source)
  base = image_base(source)
  return source unless base

  candidate = "/assets/#{base[0]}/#{base[1]}.jpg"
  File.exist?(local_asset(candidate)) ? candidate : source
end

def responsive_set(source, extension)
  base = image_base(source)
  return "" unless base

  folder, name = base
  Dir.glob(File.join(ROOT, "assets/optimized-v2/#{folder}/#{name}-*.#{extension}")).map do |file|
    width = File.basename(file)[/-(\d+)\.#{extension}\z/, 1]
    next unless width

    [width.to_i, "/#{file.delete_prefix(ROOT + "/")}"]
  end.compact.sort_by(&:first).map { |width, path| "#{path} #{width}w" }.join(", ")
end

def matching_alt(document, source, fallback)
  source_base = image_base(source)&.last
  image = document.css("main img").find do |node|
    candidate = node["src"].to_s
    candidate == source || candidate == fallback || image_base(candidate)&.last == source_base
  end
  alt = image&.[]("alt").to_s.strip
  return alt unless alt.empty?

  title = document.at_css("main h1")&.text.to_s.gsub(/\s+/, " ").strip
  title.empty? ? "Photography by Ricky Kwok" : "#{title} — photography by Ricky Kwok"
end

def semantic_picture(document, hero, source)
  fallback = jpeg_fallback(source)
  width, height = dimensions(fallback)
  avif = responsive_set(source, "avif")
  webp = responsive_set(source, "webp")
  alt = matching_alt(document, source, fallback)
  source_tags = []
  source_tags << %(<source type="image/avif" srcset="#{esc(avif)}" sizes="100vw">) unless avif.empty?
  source_tags << %(<source type="image/webp" srcset="#{esc(webp)}" sizes="100vw">) unless webp.empty?
  Nokogiri::HTML.fragment(<<~HTML).at_css("picture")
    <picture class="hero-media">
      #{source_tags.join("\n")}
      <img src="#{esc(fallback)}" width="#{width}" height="#{height}" alt="#{esc(alt)}" sizes="100vw" loading="eager" decoding="async" fetchpriority="high">
    </picture>
  HTML
end

def html_files(directory = ROOT)
  Dir.children(directory).sort.flat_map do |entry|
    next [] if EXCLUDED.include?(entry)
    full = File.join(directory, entry)
    File.directory?(full) ? html_files(full) : (entry == "index.html" ? [full] : [])
  end
end

changed = 0
(html_files + [File.join(ROOT, "404.html")]).uniq.each do |file|
  document = Nokogiri::HTML(File.read(file))
  hero = document.at_css("main .hero")
  next unless hero
  next if hero.at_css(".hero-media")

  source = hero_source(hero, document)
  next unless public_asset?(absolute_or_path(source))

  hero["class"] = [hero["class"], "has-semantic-media"].compact.join(" ").split.uniq.join(" ")
  hero.remove_attribute("style")
  picture = semantic_picture(document, hero, source)
  overlay = Nokogiri::HTML.fragment('<span class="hero-overlay" aria-hidden="true"></span>').at_css("span")
  hero.prepend_child(overlay)
  hero.prepend_child(picture)
  document.css('link[rel="preload"][as="image"]').each(&:remove)
  File.write(file, document.to_html)
  changed += 1
end

puts "Added semantic responsive hero media to #{changed} pages."
