#!/usr/bin/env ruby

require "json"
require "nokogiri"

ROOT = File.expand_path("../..", __dir__)

REDIRECTS = {
  "available-prints/index.html" => "/",
  "prints/index.html" => "/",
  "licensing/index.html" => "/",
  "contact/index.html" => "/",
  "contact/thanks/index.html" => "/",
  "shipping-returns/index.html" => "/",
  "studio-standards/index.html" => "/",
  "terms/index.html" => "/",
  "privacy/index.html" => "/",
  "press/index.html" => "/awards-recognition/",
  "press/cv/index.html" => "/biography/",
  "press/media-kit/index.html" => "/biography/",
  "exhibitions-publications/index.html" => "/awards-recognition/",
  "sources-archive/index.html" => "/awards-recognition/",
  "zh-hant/available-prints/index.html" => "/zh-hant/",
  "zh-hant/prints/index.html" => "/zh-hant/",
  "zh-hant/editions/index.html" => "/zh-hant/",
  "zh-hant/licensing/index.html" => "/zh-hant/",
  "zh-hant/contact/index.html" => "/zh-hant/",
  "zh-hant/contact/thanks/index.html" => "/zh-hant/",
  "zh-hant/shipping-returns/index.html" => "/zh-hant/",
  "zh-hant/studio-standards/index.html" => "/zh-hant/",
  "zh-hant/terms/index.html" => "/zh-hant/",
  "zh-hant/privacy/index.html" => "/zh-hant/",
  "zh-hant/press/index.html" => "/zh-hant/awards/",
  "zh-hant/press/cv/index.html" => "/zh-hant/biography/",
  "zh-hant/press/media-kit/index.html" => "/zh-hant/biography/",
  "zh-hant/exhibitions-publications/index.html" => "/zh-hant/awards/",
  "zh-hant/sources-archive/index.html" => "/zh-hant/awards/",
  "zh-hans/available-prints/index.html" => "/zh-hans/",
  "zh-hans/prints/index.html" => "/zh-hans/",
  "zh-hans/editions/index.html" => "/zh-hans/",
  "zh-hans/licensing/index.html" => "/zh-hans/",
  "zh-hans/contact/index.html" => "/zh-hans/",
  "zh-hans/contact/thanks/index.html" => "/zh-hans/",
  "zh-hans/shipping-returns/index.html" => "/zh-hans/",
  "zh-hans/studio-standards/index.html" => "/zh-hans/",
  "zh-hans/terms/index.html" => "/zh-hans/",
  "zh-hans/privacy/index.html" => "/zh-hans/",
  "zh-hans/press/index.html" => "/zh-hans/awards/",
  "zh-hans/press/cv/index.html" => "/zh-hans/biography/",
  "zh-hans/press/media-kit/index.html" => "/zh-hans/biography/",
  "zh-hans/exhibitions-publications/index.html" => "/zh-hans/awards/",
  "zh-hans/sources-archive/index.html" => "/zh-hans/awards/"
}.freeze

FORBIDDEN_HREF = %r{(?:^|/)(?:available-prints|prints|editions|licensing|contact|shipping-returns|studio-standards|terms|privacy|press)(?:/|\?|#|$)|^mailto:|behance\.net|facebook\.com|instagram\.com|flickr\.com|dcfever\.com}i

COMMERCIAL_TEXT = /(?:
  acquisition|acquire|collector|collecting|commercial|commission|client|licens|price|pricing|sale|selling|sold|purchase|buy|order|shipping|refund|payment|inquir|contact|hire|booking|book\s+me|work\s+with\s+ricky|outside\s+business|studio\s+(?:offer|pathway|contact|inquiry)|
  收藏|收購|收购|商業|商业|委託|委托|客戶|客户|授權|授权|價格|价格|售價|售价|出售|銷售|销售|購買|购买|訂購|订购|訂單|订单|運送|运输|退貨|退货|退款|付款|查詢|查询|聯絡|联系|工作室(?:報價|报价|查詢|查询|聯絡|联系)
)/ix

LOCALES = {
  "en" => {
    nav: [["Works", "/selected-works/"], ["Series", "/series/"], ["Projects", "/projects/"], ["Journal", "/journal/"], ["Awards", "/awards-recognition/"], ["About", "/biography/"]],
    brand: "Personal Photography Archive",
    notice: "This is a personal, non-commercial photography archive. No products, services, commissions, licensing, or paid work are offered.",
    description: "A personal, non-commercial photography archive by Ricky Kwok.",
    page_description: ->(name) { "#{name} — part of Ricky Kwok's personal, non-commercial photography archive." },
    hero_copy: "A personal record of urban light, ritual, motion, and constructed photographic studies, shared without any commercial purpose.",
    home: "/"
  },
  "zh-Hant" => {
    nav: [["作品", "/zh-hant/works/"], ["系列", "/zh-hant/series/"], ["項目", "/zh-hant/projects/"], ["札記", "/zh-hant/journal/"], ["獎項", "/zh-hant/awards/"], ["關於", "/zh-hant/biography/"]],
    brand: "個人攝影檔案",
    notice: "這是個人、非商業攝影檔案；不提供產品、服務、委託、授權或任何有償工作。",
    description: "郭文棣的個人、非商業攝影檔案。",
    page_description: ->(name) { "#{name}——郭文棣個人、非商業攝影檔案的一部分。" },
    hero_copy: "這是關於城市光影、儀式、動態與攝影實驗的個人記錄，只作非商業分享。",
    home: "/zh-hant/"
  },
  "zh-Hans" => {
    nav: [["作品", "/zh-hans/works/"], ["系列", "/zh-hans/series/"], ["项目", "/zh-hans/projects/"], ["札记", "/zh-hans/journal/"], ["奖项", "/zh-hans/awards/"], ["关于", "/zh-hans/biography/"]],
    brand: "个人摄影档案",
    notice: "这是个人、非商业摄影档案；不提供产品、服务、委托、授权或任何有偿工作。",
    description: "郭文棣的个人、非商业摄影档案。",
    page_description: ->(name) { "#{name}——郭文棣个人、非商业摄影档案的一部分。" },
    hero_copy: "这是关于城市光影、仪式、动态与摄影实验的个人记录，只作非商业分享。",
    home: "/zh-hans/"
  }
}.freeze

def redirect_page(target)
  <<~HTML
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="robots" content="noindex, nofollow">
      <meta http-equiv="refresh" content="0; url=#{target}">
      <link rel="canonical" href="https://rickykwok.com#{target}">
      <title>Ricky Kwok Personal Photography Archive</title>
    </head>
    <body><p><a href="#{target}">Continue to the personal photography archive</a></p></body>
    </html>
  HTML
end

def locale_for(document)
  lang = document.at_css("html")&.[]("lang").to_s
  return "zh-Hant" if lang.downcase == "zh-hant"
  return "zh-Hans" if lang.downcase == "zh-hans"
  "en"
end

def clean_schema(value, safe_description)
  case value
  when Array
    value.map { |item| clean_schema(item, safe_description) }
  when Hash
    value.delete("jobTitle")
    value.delete("sameAs")
    value.delete("license")
    value.delete("acquireLicensePage")
    value.delete("offers")
    value.delete("contactPoint")
    value.delete("potentialAction")
    value["name"] = "Ricky Kwok Personal Photography Archive" if value["@type"] == "WebSite"
    if value["description"].to_s.match?(COMMERCIAL_TEXT)
      value["description"] = safe_description
    end
    value.transform_values! { |item| clean_schema(item, safe_description) }
  else
    value
  end
end

REDIRECTS.each do |relative, target|
  File.write(File.join(ROOT, relative), redirect_page(target))
end

Dir.glob(File.join(ROOT, "**", "{index.html,404.html}"), File::FNM_EXTGLOB).sort.each do |path|
  relative = path.delete_prefix("#{ROOT}/")
  next if REDIRECTS.key?(relative)

  document = Nokogiri::HTML(File.read(path))
  locale = locale_for(document)
  copy = LOCALES.fetch(locale)

  document.css("form, [data-inquiry-form], [data-artwork-pathways], .inquiry-panel, .work-status, #modalPrint").remove
  document.css("section").each do |section|
    id = section["id"].to_s
    heading = section.at_css("h1, h2, h3")&.text.to_s
    section.remove if %w[contact inquiry-form licensing-form].include?(id) || heading.match?(COMMERCIAL_TEXT)
  end

  document.css("article, li, p").each do |element|
    next unless element.text.match?(COMMERCIAL_TEXT)
    next if element.ancestors("header, footer").any?
    element.remove
  end

  document.css("a[href]").each do |link|
    next unless link["href"].to_s.match?(FORBIDDEN_HREF)
    parent = link.parent
    if parent&.element? && %w[p li].include?(parent.name) && parent.text.strip == link.text.strip
      parent.remove
    else
      link.remove
    end
  end

  document.css(".button-row, .notes-grid, .meta-list").each do |container|
    container.remove if container.element_children.empty? || container.text.strip.empty?
  end

  document.css("script[type='application/ld+json']").each do |script|
    begin
      schema = JSON.parse(script.text)
      script.content = JSON.generate(clean_schema(schema, copy[:description]))
    rescue JSON::ParserError
      # The normal validator reports malformed structured data.
    end
  end

  document.css("meta[name='description'], meta[property='og:description'], meta[name='twitter:description']").each do |meta|
    page_name = document.at_css("title")&.text.to_s.strip
    page_name = document.at_css("h1")&.text.to_s.strip if page_name.empty?
    meta["content"] = copy[:page_description].call(page_name)
  end
  document.css("meta[property='og:site_name']").each { |meta| meta["content"] = "Ricky Kwok Personal Photography Archive" }

  document.css(".brand small").each { |small| small.content = copy[:brand] }
  document.css(".nav-links").each do |nav|
    nav.inner_html = copy[:nav].map { |label, href| %(<a href="#{href}">#{label}</a>) }.join
  end
  document.css("footer .footer-row").each do |footer|
    footer.inner_html = %(<span>© <span id="year">2026</span> Ricky Kwok 郭文棣, ARPS.</span><span>#{copy[:brand]}</span>)
  end

  document.css(".eyebrow, .kicker").each do |node|
    node.content = copy[:brand] if node.text.match?(/photographer|攝影師|摄影师/i)
  end

  if relative == "index.html" || relative == "zh-hant/index.html" || relative == "zh-hans/index.html"
    hero_inner = document.at_css(".hero-inner")
    unless hero_inner&.at_css(".hero-copy")
      hero_copy = Nokogiri::XML::Node.new("p", document)
      hero_copy["class"] = "hero-copy"
      hero_copy.content = copy[:hero_copy]
      hero_inner&.at_css("h1")&.add_next_sibling(hero_copy)
    end
  end

  document.css("header.site-header").each do |header|
    next if header.next_element&.[]("class").to_s.split.include?("personal-use-notice")
    notice = Nokogiri::XML::Node.new("div", document)
    notice["class"] = "personal-use-notice"
    notice["role"] = "note"
    notice.content = copy[:notice]
    header.add_next_sibling(notice)
  end

  document.css("[data-print], [data-price], [data-inquiry-form], [data-form-kind]").each do |node|
    %w[data-print data-price data-inquiry-form data-form-kind].each { |name| node.remove_attribute(name) }
  end

  title = document.at_css("title")
  if title
    title.content = title.text
      .gsub(/Hong Kong Fine-Art Photographer/i, "Personal Photography Archive")
      .gsub(/Fine-Art Photographer/i, "Personal Photography Archive")
      .gsub(/Hong Kong Photographer/i, "Personal Photography Archive")
      .gsub(/香港藝術攝影家|香港艺术摄影家|攝影家|摄影家/, copy[:brand])
  end


  document.traverse do |node|
    next unless node.text?
    node.content = node.text
      .gsub(/Hong Kong fine-art and documentary photographer/i, "Hong Kong photography enthusiast")
      .gsub(/fine-art and documentary photographer/i, "photography enthusiast")
      .gsub(/Hong Kong photographer/i, "Hong Kong photography enthusiast")
      .gsub(/professional distinction/i, "RPS distinction")
      .gsub(/constructed studio experiments?/i, "controlled photographic experiments")
      .gsub(/studio experiments?/i, "controlled photographic experiments")
      .gsub(/in the studio work/i, "in the controlled studies")
      .gsub(/Studio Collision Studies/i, "Constructed Collision Studies")
      .gsub(/攝影棚碰撞研究/, "構成碰撞研究")
      .gsub(/摄影棚碰撞研究/, "构成碰撞研究")
  end

  document.css("section").each do |section|
    next if section.at_css("img, picture, article, li")
    section.remove if section.text.gsub(/\s+/, " ").strip.length < 55
  end

  unless document.at_css("h1")
    main = document.at_css("main")
    if main
      heading = document.at_css("title")&.text.to_s.split("|").first.to_s.strip
      section = Nokogiri::XML::Node.new("section", document)
      section["class"] = "section section-warm"
      wrap = Nokogiri::XML::Node.new("div", document)
      wrap["class"] = "wrap"
      h1 = Nokogiri::XML::Node.new("h1", document)
      h1.content = heading
      lead = Nokogiri::XML::Node.new("p", document)
      lead["class"] = "lead"
      lead.content = copy[:hero_copy]
      wrap.add_child(h1)
      wrap.add_child(lead)
      section.add_child(wrap)
      main.children.first ? main.children.first.add_previous_sibling(section) : main.add_child(section)
    end
  end

  html = document.to_html.gsub(%r{</source>}i, "")
  File.write(path, html)
end

redirect_config_path = File.join(ROOT, "edge/redirect-map.json")
redirect_config = JSON.parse(File.read(redirect_config_path))
REDIRECTS.each do |relative, target|
  route = relative == "index.html" ? "/" : "/#{relative.sub(%r{/index\.html\z}, "/")}"
  redirect_config.fetch("redirects")[route] = target
end
redirect_config.fetch("redirects")["/exhibitions-publications/"] = "/awards-recognition/"
redirect_config.fetch("redirects")["/zh-hant/exhibitions-publications/"] = "/zh-hant/awards/"
redirect_config.fetch("redirects")["/zh-hans/exhibitions-publications/"] = "/zh-hans/awards/"
File.write(redirect_config_path, "#{JSON.pretty_generate(redirect_config)}\n")

puts "Removed commercial pathways from #{Dir.glob(File.join(ROOT, '**', '{index.html,404.html}'), File::FNM_EXTGLOB).length} HTML pages."
