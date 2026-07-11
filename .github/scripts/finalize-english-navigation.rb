#!/usr/bin/env ruby
# frozen_string_literal: true

require "nokogiri"

ROOT = File.expand_path("../..", __dir__)
ORIGIN = "https://rickykwok.com"
EXCLUDED = %w[.git .github assets zh-hant zh-hans].freeze

def files(directory)
  Dir.children(directory).sort.flat_map do |entry|
    next [] if EXCLUDED.include?(entry)
    full = File.join(directory, entry)
    File.directory?(full) ? files(full) : (entry == "index.html" ? [full] : [])
  end
end

def english_route(file)
  relative = file.sub(%r{^#{Regexp.escape(ROOT)}/?}, "")
  relative == "index.html" ? "/" : "/#{relative.sub(%r{/index\.html$}, "/")}"
end

def local_route(route)
  case route
  when "/selected-works/" then "/works/"
  when "/prints/" then "/editions/"
  when "/awards-recognition/" then "/awards/"
  else route
  end
end

def switcher(route)
  localized = local_route(route)
  Nokogiri::HTML.fragment(<<~HTML).at_css(".language-switcher")
    <div class="language-switcher" aria-label="Language"><a href="#{route}" lang="en" aria-current="page">English</a><a href="/zh-hant#{localized}" lang="zh-Hant">繁中</a><a href="/zh-hans#{localized}" lang="zh-Hans">简体</a></div>
  HTML
end

files(ROOT).each do |file|
  document = Nokogiri::HTML(File.read(file))
  route = english_route(file)
  localized = local_route(route)

  document.css(".site-header .nav-links a[href^='/zh-hant/'], .site-header .nav-links a[href^='/zh-hans/']").remove
  document.css(".site-header .language-switcher, .site-footer .language-switcher").remove
  document.at_css(".site-header .nav")&.add_child(switcher(route))
  document.at_css(".site-footer .footer-row")&.add_child(switcher(route))

  robots = document.at_css('meta[name="robots"]')&.[]("content").to_s.downcase
  unless robots.include?("noindex")
    document.css('head link[rel="alternate"]').remove
    alternates = Nokogiri::HTML.fragment(<<~HTML)
      <link rel="alternate" hreflang="en" href="#{ORIGIN}#{route}">
      <link rel="alternate" hreflang="zh-Hant" href="#{ORIGIN}/zh-hant#{localized}">
      <link rel="alternate" hreflang="zh-Hans" href="#{ORIGIN}/zh-hans#{localized}">
      <link rel="alternate" hreflang="x-default" href="#{ORIGIN}#{route}">
    HTML
    document.at_css("head")&.add_child(alternates)
  end

  File.write(file, document.to_html)
end

puts "Completed reciprocal English, Traditional Chinese, and Simplified Chinese navigation and hreflang."
