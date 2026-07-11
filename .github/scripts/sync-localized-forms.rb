#!/usr/bin/env ruby
# frozen_string_literal: true

require "nokogiri"

ROOT = File.expand_path("../..", __dir__)

TEXT = {
  "Studio contact" => "工作室聯絡",
  "The form sends a structured inquiry directly to the studio and provides an on-screen and email confirmation. If the form is unavailable, email the studio with the artwork title or project context." => "表格會把結構化查詢直接送到工作室，並提供畫面及電郵確認。如表格暫時無法使用，請以電郵提供作品名稱或項目背景。",
  "Response time" => "回覆時間",
  "The studio aims to reply within three business days. Please state any earlier publication or exhibition deadline in your message." => "工作室目標在三個工作天內回覆。如出版或展覽期限更早，請在訊息中清楚列明。",
  "Email Studio" => "電郵工作室",
  "Licensing requirements" => "授權資料",
  "Leave this field empty" => "請勿填寫此欄",
  "Please check the highlighted fields." => "請檢查已標示的欄位。",
  "Name" => "姓名",
  "Email" => "電郵",
  "Organization or venue" => "機構或場地",
  "Optional" => "選填",
  "Inquiry type" => "查詢類型",
  "Select a pathway" => "請選擇查詢途徑",
  "Print acquisition" => "作品收藏",
  "Exhibition proposal" => "展覽提案",
  "Curatorial inquiry" => "策展查詢",
  "Press or interview" => "媒體或訪問",
  "General inquiry" => "一般查詢",
  "Artwork or series" => "作品或系列",
  "Example: Light Encroached Homes / 光染民居" => "例如：Light Encroached Homes / 光染民居",
  "Message" => "訊息",
  "For prints: preferred size and delivery city. For exhibitions: venue, dates, theme, requested works, and deadline." => "收藏請提供偏好尺寸及送貨城市；展覽請提供場地、日期、主題、所需作品與期限。",
  "Include enough context for the studio to assess the request." => "請提供足夠背景，讓工作室評估要求。",
  "I agree that my details may be processed to respond to this inquiry." => "我同意工作室處理我的資料，以回覆這項查詢。",
  "Read the privacy notice" => "閱讀私隱通知",
  "This form is protected by a honeypot and FormSubmit reCAPTCHA. Do not include payment-card details or other sensitive personal information." => "表格使用隱藏防垃圾欄位及 FormSubmit reCAPTCHA 保護。請勿提交付款卡資料或其他敏感個人資料。",
  "Send inquiry" => "提交查詢",
  "Before you send" => "提交前準備",
  "Prepare the usage facts." => "先準備清楚的使用資料。",
  "The more exact the request, the faster the studio can confirm availability and prepare an appropriate license. A budget range can be preliminary; no public fee schedule is assumed." => "資料越準確，工作室越能迅速核實圖片及擬定合適授權。預算範圍可以是初步數字；網站不假設統一公開收費。",
  "Exact image title or page URL" => "準確圖片標題或作品頁網址",
  "Media, placement, territory, and duration" => "媒體、版位、地區與期限",
  "Distribution or audience size" => "發行量或受眾規模",
  "Exclusive or non-exclusive use" => "獨家或非獨家使用",
  "Deadline and requested modifications" => "截止日期及要求的修改",
  "The studio aims to reply within three business days. State a fixed editorial or exhibition deadline clearly." => "工作室目標在三個工作天內回覆。請清楚列明固定出版或展覽期限。",
  "Work email" => "工作電郵",
  "Company, publisher, or institution" => "公司、出版社或機構",
  "Project, publication, or campaign" => "項目、出版物或活動",
  "Image title or page URL" => "圖片標題或作品頁網址",
  "Use category" => "使用類別",
  "Select one" => "請選擇",
  "Editorial publication" => "編輯出版",
  "Book or catalogue" => "書籍或目錄",
  "Exhibition" => "展覽",
  "Educational or institutional" => "教育或機構用途",
  "Commercial campaign" => "商業活動",
  "Other" => "其他",
  "Media and placement" => "媒體與版位",
  "Print, website, cover, inside page, display…" => "印刷、網站、封面、內頁、展示等",
  "Territory" => "地區",
  "Hong Kong, worldwide, named markets…" => "香港、全球或指定市場",
  "Duration" => "期限",
  "One issue, 12 months, exhibition dates…" => "一期、12個月或展覽日期",
  "Distribution or audience" => "發行量或受眾",
  "Print run, monthly users, venue visitors…" => "印量、每月用戶或場地訪客",
  "Exclusivity" => "獨家性",
  "Non-exclusive" => "非獨家",
  "Exclusive — please describe" => "獨家 — 請說明",
  "Not sure" => "未確定",
  "Deadline" => "截止日期",
  "Budget range" => "預算範圍",
  "Currency and range, or not yet set" => "貨幣與範圍，或尚未確定",
  "A preliminary range is sufficient." => "初步範圍已足夠。",
  "Release requirements" => "授權書需要",
  "Model release required" => "需要肖像授權書",
  "Property release required" => "需要物業授權書",
  "Both may be required" => "兩者可能均需要",
  "No release required for intended use" => "預定用途不需要授權書",
  "Requested crop, text overlay, retouching, or other modification" => "要求的裁切、文字覆蓋、修圖或其他修改",
  "Describe every intended change, or write ‘none’." => "請說明每項預定修改，沒有則填「沒有」。",
  "No modification is approved merely because it is described here." => "在此描述修改並不代表修改已獲批准。",
  "File specifications and additional context" => "檔案規格與其他資料",
  "Dimensions, colour profile, delivery format, language editions, schedule, or other details." => "尺寸、色彩設定、交付格式、語言版本、時間表或其他資料。",
  "I understand that this request does not grant permission and that use requires a written license." => "我明白提交要求不等於取得許可，使用圖片必須獲得書面授權。",
  "I agree that my details may be processed to assess and respond to this request." => "我同意工作室處理我的資料，以評估及回覆這項要求。",
  "This form is protected by a honeypot and FormSubmit reCAPTCHA. Do not send payment-card details, identity documents, or confidential unreleased materials." => "表格使用隱藏防垃圾欄位及 FormSubmit reCAPTCHA 保護。請勿提交付款卡資料、身份文件或未公開機密材料。",
  "Send licensing request" => "提交授權要求",
  "Inquiry status" => "查詢狀態",
  "No recent submission can be verified in this browser." => "此瀏覽器目前沒有可核實的近期提交。",
  "This page only confirms a request when it is reached directly from a completed studio form in the same browser session." => "只有在同一瀏覽器工作階段完成工作室表格並直接到達本頁，系統才會確認查詢。",
  "No verified reference" => "未有可核實編號",
  "Return to the appropriate form." => "請返回合適的表格。",
  "A bookmarked or shared confirmation URL does not prove that a request was delivered. If you recently tried to submit and did not receive a reference or confirmation, review the form and try again." => "收藏或分享確認頁網址並不代表查詢已送達。如你剛才嘗試提交但沒有收到編號或確認，請檢查表格後再試。",
  "Start again" => "重新開始",
  "Choose the pathway that matches your request." => "選擇符合你需要的查詢途徑。",
  "Studio inquiry" => "工作室查詢",
  "Image licensing" => "圖片授權",
  "Selected works" => "精選作品",
  "Your reference" => "你的查詢編號",
  "Keep the lead ID for follow-up." => "請保留 Lead ID 以便跟進。",
  "Lead ID" => "Lead ID",
  "Unavailable in this view" => "此畫面未能提供",
  "Your submitted pathway" => "你提交的查詢途徑",
  "As entered on the form" => "按表格填寫內容",
  "What happens next" => "下一步",
  "The studio aims to reply within three business days." => "工作室目標在三個工作天內回覆。",
  "The reply may ask for missing details before edition availability, exhibition feasibility, permission, files, or licensing terms can be confirmed. A form submission is not itself a sale, reservation, license, or permission to reproduce an image." => "在確認版本供應、展覽可行性、權限、檔案或授權條款之前，工作室可能要求補充資料。提交表格本身並不是出售、預留、授權或複製圖片的許可。",
  "If a publication or exhibition deadline falls within three business days, email" => "如出版或展覽期限在三個工作天內，請電郵",
  "and include your lead ID and deadline." => "，並附上 Lead ID 與截止日期。",
  "Return to selected works" => "返回精選作品",
  "Review licensing" => "查看授權資料",
  "Send another inquiry" => "提交另一項查詢",
  "JavaScript is off, so the on-page reference summary cannot be displayed. Your submitted details remain in the email copy." => "JavaScript 已關閉，因此頁面無法顯示編號摘要；你提交的資料仍會保留在電郵副本。"
}.freeze

ATTRIBUTE_TEXT = TEXT.merge(
  "Organization" => "機構",
  "Inquiry type" => "查詢類型",
  "Message" => "訊息",
  "Privacy consent" => "私隱同意",
  "Project or publication" => "項目或出版物",
  "Use category" => "使用類別",
  "Media and placement" => "媒體與版位",
  "Distribution or audience" => "發行量或受眾",
  "Release requirements" => "授權書需要",
  "Rights acknowledgement" => "權利確認"
).freeze

def translate_fragment(node)
  node.xpath(".//text()").each do |text_node|
    value = text_node.text.strip
    text_node.content = TEXT[value] if TEXT[value]
  end
  node.css("[placeholder], [data-error-label]").each do |element|
    %w[placeholder data-error-label].each do |attribute|
      value = element[attribute]
      element[attribute] = ATTRIBUTE_TEXT[value] if ATTRIBUTE_TEXT[value]
    end
  end
  node.css('a[href^="/"]').each do |anchor|
    href = anchor["href"]
    next if href.start_with?("/zh-hant/")
    path, suffix = href.split(/(?=[?#])/, 2)
    path = "/works/" if ["/selected-works/", "/works/"].include?(path)
    path = "/editions/" if ["/prints/", "/available-prints/"].include?(path)
    path = "/awards/" if ["/awards/", "/awards-recognition/"].include?(path)
    anchor["href"] = "/zh-hant#{path}#{suffix}"
  end
  node
end

def sync_page(source_path, target_path, selector, next_url:, source_url:)
  source = Nokogiri::HTML(File.read(File.join(ROOT, source_path)))
  target_file = File.join(ROOT, target_path)
  target = Nokogiri::HTML(File.read(target_file))
  source_section = source.at_css(selector)&.ancestors("section")&.first
  raise "Missing source form section: #{source_path}" unless source_section

  form_id = source_section.at_css("form")&.[]("id")
  existing_form = form_id ? target.at_css("form##{form_id}") : target.at_css("form[data-form-kind='licensing']")
  existing_form&.ancestors("section")&.first&.remove

  section = Nokogiri::HTML.fragment(source_section.to_html).at_css("section")
  translate_fragment(section)
  section.at_css('input[name="_next"]')["value"] = next_url
  section.at_css('input[name="_url"]')["value"] = source_url
  section.at_css('input[name="_subject"]')["value"] = "網站查詢 — Ricky Kwok Photography"
  if (response = section.at_css('input[name="_autoresponse"]'))
    response["value"] = "多謝聯絡 Ricky Kwok Photography 工作室。你的查詢已收到，工作室目標在三個工作天內回覆。請保留提交資料內的查詢編號作日後參考。"
  end

  hero = target.at_css("main .hero")
  hero.add_next_sibling(section)
  File.write(target_file, target.to_html)
end

sync_page(
  "contact/index.html",
  "zh-hant/contact/index.html",
  "form#inquiry-form",
  next_url: "https://rickykwok.com/zh-hant/contact/thanks/",
  source_url: "https://rickykwok.com/zh-hant/contact/"
)

sync_page(
  "licensing/index.html",
  "zh-hant/licensing/index.html",
  "form[data-form-kind='licensing']",
  next_url: "https://rickykwok.com/zh-hant/contact/thanks/?type=licensing",
  source_url: "https://rickykwok.com/zh-hant/licensing/"
)

def sync_confirmation_page
  source = Nokogiri::HTML(File.read(File.join(ROOT, "contact/thanks/index.html")))
  target_file = File.join(ROOT, "zh-hant/contact/thanks/index.html")
  target = Nokogiri::HTML(File.read(target_file))
  main = Nokogiri::HTML.fragment(source.at_css("main").to_html).at_css("main")
  translate_fragment(main)
  target.at_css("body")["data-confirmation-page"] = ""
  target.at_css("main").replace(main)
  File.write(target_file, target.to_html)
end

sync_confirmation_page

puts "Synchronized complete Traditional Chinese contact, licensing, and confirmation flows."
