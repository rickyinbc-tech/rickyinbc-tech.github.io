import assert from "node:assert/strict";
import test from "node:test";
import { photographyScopeFindings } from "./photography-scope-policy.mjs";

const rejected = [
  '<a href="https://www.fpcanada.ca/planner-directory/planner-detail/example">Directory</a>',
  '<a href="https://www.credly.com/badges/example">Verification</a>',
  '<a href="https://www.csi.ca/">Issuer</a>',
  '<p>FP Canada directory profile</p>',
  '<p>FP <strong>Canada</strong> directory profile</p>',
  '<p>F&#80;&nbsp;Canada</p>',
  '<meta name="description" content="PFP, CIWM and CIM credentials">',
  '<p>CFP professional</p>',
  '<p>RBC representative</p>',
  '<p>Royal Mutual Funds Inc.</p>',
  '<p>Canadian Securities Institute</p>',
  '<p>Financial-planning profile</p>',
  '<p>Wealth management</p>',
  '<p>財務策劃</p>',
  '<p>财务策划</p>',
  '<script type="application/ld+json">{"subjectOf":{"url":"https://www.fpcanada.ca/example"}}</script>',
  '<script type="application/ld+json">{"subjectOf":{"url":"https://www.credly.com/example"}}</script>',
  String.raw`<script type="application/ld+json">{"subjectOf":{"url":"https:\/\/www.\u0066pcanada.ca/example"}}</script>`,
  '<!-- PFP credential reference -->',
];

for (const [index, fixture] of rejected.entries()) {
  test(`reject professional-content regression ${index + 1}`, () => {
    assert.ok(photographyScopeFindings(fixture).length > 0);
  });
}

for (const fixture of [
  '<h1>Ricky Kwok 郭文棣 | Photography Archive</h1>',
  '<p>Man Tai Kwok, ARPS. Associate of the Royal Photographic Society.</p>',
  '<p>Personal, non-commercial photography archive.</p>',
  '<p>Bank of China Light Trails</p>',
  '<p>National Geographic Channel Hong Kong photography competition champion.</p>',
  '<script type="application/ld+json">{"subjectOf":{"url":"https://www.hku.hk/press/news_detail_11253.html"}}</script>',
]) {
  test(`retain photography content: ${fixture.slice(0, 70)}`, () => {
    assert.deepEqual(photographyScopeFindings(fixture), []);
  });
}
