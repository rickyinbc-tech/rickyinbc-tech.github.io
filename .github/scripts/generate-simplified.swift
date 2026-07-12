#!/usr/bin/env swift

import Foundation

let fileManager = FileManager.default
let scriptURL = URL(fileURLWithPath: #filePath)
let root = scriptURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
let sourceRoot = root.appendingPathComponent("zh-hant", isDirectory: true)
let targetRoot = root.appendingPathComponent("zh-hans", isDirectory: true)
let requestedPaths = Set(CommandLine.arguments.dropFirst().flatMap { argument -> [String] in
    guard argument.hasPrefix("--only=") else { return [] }
    return argument.dropFirst("--only=".count).split(separator: ",").map(String.init)
})

func shouldGenerate(_ relative: String) -> Bool {
    guard !requestedPaths.isEmpty else { return true }
    let withoutIndex = relative.replacingOccurrences(of: "/index.html", with: "")
    return requestedPaths.contains(relative) || requestedPaths.contains(withoutIndex)
}

func protectedMatches(_ pattern: String, in source: String, prefix: String) throws -> (String, [String]) {
    let regex = try NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    let matches = regex.matches(in: source, range: NSRange(source.startIndex..., in: source)).reversed()
    var output = source
    var records: [String] = []
    for match in matches {
        guard let range = Range(match.range, in: output) else { continue }
        let value = String(output[range])
        let token = "__\(prefix)_\(records.count)__"
        records.append(value)
        output.replaceSubrange(range, with: token)
    }
    return (output, records)
}

func restore(_ source: String, records: [String], prefix: String) -> String {
    var output = source
    for (index, value) in records.enumerated() {
        output = output.replacingOccurrences(of: "__\(prefix)_\(index)__", with: value)
    }
    return output
}

func simplifiedHTML(_ source: String) throws -> String {
    let protectedAlternate = try protectedMatches(#"<link\b[^>]*hreflang=["']zh-Hant["'][^>]*>"#, in: source, prefix: "TRADALT")
    let protectedAnchors = try protectedMatches(#"<a\b[^>]*lang=["']zh-Hant["'][^>]*>[\s\S]*?</a>"#, in: protectedAlternate.0, prefix: "TRADANCHOR")
    var output = protectedAnchors.0
    output = output.applyingTransform(StringTransform("Traditional-Simplified"), reverse: false) ?? output
    output = output.replacingOccurrences(of: "/zh-hant/", with: "/zh-hans/")
    output = output.replacingOccurrences(of: "zh-Hant", with: "zh-Hans")
    output = output.replacingOccurrences(of: "zh_HK", with: "zh_CN")
    output = output.replacingOccurrences(of: "繁体中文", with: "简体中文")
    output = restore(output, records: protectedAnchors.1, prefix: "TRADANCHOR")
    output = restore(output, records: protectedAlternate.1, prefix: "TRADALT")
    output = output.replacingOccurrences(of: " lang=\"zh-Hant\" aria-current=\"page\"", with: " lang=\"zh-Hant\"")
    output = output.replacingOccurrences(of: " lang=\"zh-Hans\">", with: " lang=\"zh-Hans\" aria-current=\"page\">")
    output = output.replacingOccurrences(of: "<html lang=\"zh-Hans\" aria-current=\"page\">", with: "<html lang=\"zh-Hans\">")
    return output
}

guard let enumerator = fileManager.enumerator(at: sourceRoot, includingPropertiesForKeys: nil) else {
    fatalError("Unable to enumerate \(sourceRoot.path)")
}

var count = 0
for case let sourceURL as URL in enumerator where sourceURL.lastPathComponent == "index.html" {
    let relative = sourceURL.path.replacingOccurrences(of: sourceRoot.path + "/", with: "")
    guard shouldGenerate(relative) else { continue }
    let targetURL = targetRoot.appendingPathComponent(relative)
    try fileManager.createDirectory(at: targetURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    let source = try String(contentsOf: sourceURL, encoding: .utf8)
    try simplifiedHTML(source).write(to: targetURL, atomically: true, encoding: .utf8)
    count += 1
}

print("Generated \(count) complete Simplified Chinese pages from the reviewed Traditional Chinese edition.")
