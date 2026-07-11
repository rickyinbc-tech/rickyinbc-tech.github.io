#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "nokogiri"

ROOT = File.expand_path("../..", __dir__)
ORIGIN = "https://rickykwok.com"

def local_route(file)
  relative = file.sub(%r{^#{Regexp.escape(File.join(ROOT, "zh-hant"))}/?}, "")
  relative == "index.html" ? "/" : "/#{relative.sub(%r{/index\.html$}, "/")}"
end

def english_route(route)
  case route
  when "/works/" then "/selected-works/"
  when "/editions/" then "/prints/"
  when "/awards/" then "/awards-recognition/"
  else route
  end
end

def localized_href(href)
  return href unless href&.start_with?("/")
  return href if href.start_with?("/zh-hant/", "/zh-hans/", "/assets/")

  path, suffix = href.split(/(?=[?#])/, 2)
  mapped = case path
           when "/", "" then "/zh-hant/"
           when "/selected-works/", "/works/" then "/zh-hant/works/"
           when "/prints/", "/available-prints/" then "/zh-hant/editions/"
           when "/awards-recognition/", "/awards/" then "/zh-hant/awards/"
           else "/zh-hant#{path}"
           end
  "#{mapped}#{suffix}"
end

def switcher(document, route)
  fragment = Nokogiri::HTML.fragment(<<~HTML)
    <div class="language-switcher" aria-label="語言選擇"><a href="#{english_route(route)}" lang="en">English</a><a href="/zh-hant#{route}" lang="zh-Hant" aria-current="page">繁中</a><a href="/zh-hans#{route}" lang="zh-Hans">简体</a></div>
  HTML
  fragment.at_css(".language-switcher")
end

Dir.glob(File.join(ROOT, "zh-hant/**/index.html")).sort.each do |file|
  document = Nokogiri::HTML(File.read(file))
  route = local_route(file)

  document.css("body a[href]").each do |anchor|
    next if anchor.ancestors(".language-switcher").any? || anchor["lang"]
    if anchor.text.strip.start_with?("English")
      anchor["href"] = english_route(route)
      next
    end
    anchor["href"] = localized_href(anchor["href"])
  end

  unless document.at_css(".site-header .language-switcher")
    document.at_css(".site-header .nav")&.add_child(switcher(document, route))
  end
  unless document.at_css(".site-footer .language-switcher")
    document.at_css(".site-footer .footer-row")&.add_child(switcher(document, route))
  end

  robots = document.at_css('meta[name="robots"]')&.[]("content").to_s.downcase
  unless robots.include?("noindex")
    title = document.at_css("title")
    title.content = "#{title.text.strip}｜繁體中文" if title && !title.text.include?("繁體中文")
    document.css('head link[rel="alternate"]').remove
    english = english_route(route)
    alternates = Nokogiri::HTML.fragment(<<~HTML)
      <link rel="alternate" hreflang="en" href="#{ORIGIN}#{english}">
      <link rel="alternate" hreflang="zh-Hant" href="#{ORIGIN}/zh-hant#{route}">
      <link rel="alternate" hreflang="zh-Hans" href="#{ORIGIN}/zh-hans#{route}">
      <link rel="alternate" hreflang="x-default" href="#{ORIGIN}#{english}">
    HTML
    document.at_css("head")&.add_child(alternates)
  end

  File.write(file, document.to_html)
end

puts "Localized all internal body links and completed three-language navigation on Traditional Chinese pages."
