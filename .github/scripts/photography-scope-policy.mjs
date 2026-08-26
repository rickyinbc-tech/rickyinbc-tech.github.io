// Keep this hobby archive separate from professional financial promotion.
// This is a content regression check, not a legal or compliance determination.
const rules = [
  ["financial credential/directory link", /\b(?:fpcanada\.ca|credly\.com|csi\.ca)\b/iu],
  ["financial credential or employer reference", /\b(?:FP\s*Canada|CFP|PFP|CIWM|CIM|CSI|RBC|RMFI)\b/iu],
  ["financial institution or credential issuer", /\b(?:Royal\s+Bank\s+of\s+Canada|Royal\s+Mutual\s+Funds|Canadian\s+Securities\s+Institute)\b/iu],
  ["financial professional positioning", /\b(?:financial[\s-]+plann(?:er|ers|ing)|wealth[\s-]+manag(?:er|ers|ement)|investment[\s-]+manag(?:er|ers|ement)|financial[\s-]+(?:advis[eo]rs?|advice|services?))\b/iu],
  ["Chinese financial professional positioning", /財務策劃|财务策划|財富管理|财富管理|投資管理|投资管理|加拿大皇家銀行|加拿大皇家银行/u],
];

function normalizedContent(content) {
  return content
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, value) => {
      const number = value[0].toLowerCase() === "x"
        ? Number.parseInt(value.slice(1), 16)
        : Number.parseInt(value, 10);
      return number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    })
    .replace(/&(?:nbsp|ensp|emsp);/gi, " ")
    .replace(/\\\//g, "/")
    .normalize("NFKC");
}

export function photographyScopeFindings(content) {
  // Inspect the entire payload, including URLs, comments, metadata and JSON-LD.
  // Also inspect text across inline markup so a split label is still checked.
  const raw = normalizedContent(content);
  const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  return rules.filter(([, pattern]) => pattern.test(raw) || pattern.test(text))
    .map(([label]) => label);
}
