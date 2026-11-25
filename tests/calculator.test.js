import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extract(pattern, description) {
  const match = html.match(pattern);
  assert.ok(match, `index.html에서 ${description}을(를) 찾지 못했습니다.`);
  return match[0];
}

const context = vm.createContext({});
vm.runInContext(
  [
    extract(/  const WEAPONS = \[[\s\S]*?\n  \];/, "WEAPONS"),
    extract(/  function formatDamage\(value\) \{[\s\S]*?\n  \}/, "formatDamage"),
    extract(/  function calculate\(weapon, strength, quality\) \{[\s\S]*?\n  \}/, "calculate"),
    extract(/  function calculateQualityRange\(weapon\) \{[\s\S]*?\n  \}/, "calculateQualityRange"),
    extract(/  function getEnhanceTargetLevel\(currentLevel, additionalLevels\) \{[\s\S]*?\n  \}/, "getEnhanceTargetLevel"),
    extract(/  function calculateEnhanceSuccessRate\(level\) \{[\s\S]*?\n  \}/, "calculateEnhanceSuccessRate"),
    extract(/  function calculateEnhancePity\(successRatePercent\) \{[\s\S]*?\n  \}/, "calculateEnhancePity"),
    extract(/  function formatEnhanceSuccessRate\(successRatePercent\) \{[\s\S]*?\n  \}/, "formatEnhanceSuccessRate"),
    extract(/  function calculateEnhanceAttemptCost\(baseCost, level\) \{[\s\S]*?\n  \}/, "calculateEnhanceAttemptCost"),
    extract(/  function calculateEnhanceCost\(fromLevel, toLevel, baseCost\) \{[\s\S]*?\n  \}/, "calculateEnhanceCost"),
    "globalThis.calculator = { WEAPONS, formatDamage, calculate, calculateQualityRange, getEnhanceTargetLevel, calculateEnhanceSuccessRate, calculateEnhancePity, formatEnhanceSuccessRate, calculateEnhanceAttemptCost, calculateEnhanceCost };"
  ].join("\n"),
  context
);

const {
  WEAPONS, formatDamage, calculate, calculateQualityRange, getEnhanceTargetLevel,
  calculateEnhanceSuccessRate, calculateEnhancePity, formatEnhanceSuccessRate,
  calculateEnhanceAttemptCost, calculateEnhanceCost
} = context.calculator;
const weapon = id => WEAPONS.find(item => item.id === id);

function assertClose(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual}이(가) 기대값 ${expected}과(와) 허용 오차 ${tolerance}를 초과합니다.`
  );
}

test("0강 100품은 모든 무기의 기본 공격력과 동일하다", () => {
  for (const item of WEAPONS) {
    const result = calculate(item, 0, 100);
    assert.equal(result.min, item.min);
    assert.equal(result.max, item.max);
  }
});

test("품질 범위는 무기별 0강 1품 최소와 100품 최대로 고정된다", () => {
  const executioner = calculateQualityRange(weapon("망집"));
  assertClose(executioner.min, 371.85);
  assertClose(executioner.max, 1110);

  const light = calculateQualityRange(weapon("심빛"));
  assertClose(light.min, 254.6);
  assertClose(light.max, 760);
});

test("성공 확률과 천장은 캡처값에 맞는 단계별 추정식으로 계산된다", () => {
  const observations = [
    { level: 0, rate: "100%", pity: 3 },
    { level: 5, rate: "47.04%", pity: 5 },
    { level: 25, rate: "2.3%", pity: 109 },
    { level: 34, rate: "0.592%", pity: 422 },
    { level: 45, rate: "0.112%", pity: 2216 }
  ];

  for (const { level, rate, pity } of observations) {
    const successRate = calculateEnhanceSuccessRate(level);
    assert.equal(formatEnhanceSuccessRate(successRate), rate);
    assert.equal(calculateEnhancePity(successRate), pity);
  }
});

test("예상 비용은 단계별 성공 확률과 천장을 반영한다", () => {
  const firstLevel = calculateEnhanceCost(0, 1, 1000);
  assertClose(firstLevel.expectedAttempts, 1);
  assertClose(firstLevel.expectedCost, 1000);
  assert.equal(firstLevel.maxAttempts, 3);
  assert.equal(firstLevel.maxCost, 3000);

  const level25 = calculateEnhanceCost(25, 26, 1000);
  assert.equal(level25.maxAttempts, 109);
  assertClose(level25.maxCost, 109 * 1000 * Math.pow(1.1, 25));
});

test("강화 1회 비용은 0강 기본 비용에 강화 단계별 1.1 배율을 적용한다", () => {
  const executionerCost = calculateEnhanceAttemptCost(weapon("망집").enhanceBaseCost, 0);
  const fishingRodCost = calculateEnhanceAttemptCost(weapon("고낚").enhanceBaseCost, 25);
  const riftOneCost = calculateEnhanceAttemptCost(weapon("리프트I").enhanceBaseCost, 5);
  const abyssEndCost = calculateEnhanceAttemptCost(weapon("심끝").enhanceBaseCost, 45);
  const riftThreeCost = calculateEnhanceAttemptCost(weapon("리프트III").enhanceBaseCost, 34);

  assert.equal(executionerCost, 25000);
  assertClose(fishingRodCost, 151632, 1);
  assert.equal(formatDamage(fishingRodCost), "151.63k");
  assertClose(riftOneCost, 24150, 1);
  assert.equal(formatDamage(riftOneCost), "24.15k");
  assert.equal(formatDamage(abyssEndCost), "1.31m");
  assertClose(riftThreeCost, 363210, 2);
  assert.equal(formatDamage(riftThreeCost), "363.21k");
  assert.match(html, /현재 강화 비용 <span class="value" id="enhanceCurrentAttemptCost">/);
  assert.doesNotMatch(html, /id="enhanceCostInput"/);
  assert.doesNotMatch(html, /enhanceProtectionCheckbox|강화하락 방지권 사용/);
});

test("강화 비용 목표는 현재 강화에서 추가 단계만큼 계산하고 70강을 넘지 않는다", () => {
  assert.equal(getEnhanceTargetLevel(12, 1), 13);
  assert.equal(getEnhanceTargetLevel(65, 5), 70);
  assert.equal(getEnhanceTargetLevel(70, 1), 70);
  assert.doesNotMatch(html, /id="enhanceFromInput"/);
  assert.match(html, /id="enhanceToInput" min="0" max="70" value="1"/);
});

test("강화 비용은 레벨이 올라갈수록 성공률이 낮아져 비용이 증가한다", () => {
  const low = calculateEnhanceCost(0, 1, 1000);
  const high = calculateEnhanceCost(60, 61, 1000);
  assert.ok(high.expectedAttempts > low.expectedAttempts);
  assert.ok(high.expectedCost > low.expectedCost);
});

test("천장(피티)이 적용되면 최대 시도 횟수가 제한된다", () => {
  const result = calculateEnhanceCost(34, 35, 1000);
  assert.equal(result.maxAttempts, 422);
  assertClose(result.maxCost, 422 * 1000 * Math.pow(1.1, 34));
});

test("다중 강화를 시도할 때 비용이 누적된다", () => {
  const single = calculateEnhanceCost(0, 1, 1000);
  const multi = calculateEnhanceCost(0, 3, 1000);
  assert.ok(multi.expectedAttempts > single.expectedAttempts);
  assert.ok(multi.expectedCost > single.expectedCost);
});

test("망집 0강 4품은 게임 표시값과 일치한다", () => {
  const result = calculate(weapon("망집"), 0, 4);
  assertClose(result.min, 377.4);
  assertClose(result.max, 754.8);
});

test("심끝 45강 93품은 게임 표시값과 일치한다", () => {
  const result = calculate(weapon("심끝"), 45, 93);
  assertClose(result.min, 9025.45);
  assertClose(result.max, 18050.91);
});

test("망집 57강 99품은 게임 표시값과 일치한다", () => {
  const result = calculate(weapon("망집"), 57, 99);
  assertClose(result.min, 26164.85);
  assertClose(result.max, 52329.7);
});

test("10,000 미만은 k 없이 소수 첫째 자리까지 표시한다", () => {
  assert.equal(formatDamage(0), "0");
  assert.equal(formatDamage(754.8), "754.8");
  assert.equal(formatDamage(1110), "1110");
  assert.equal(formatDamage(9999.94), "9999.9");
});

test("k는 10,000부터 적용하되 항상 1,000으로 나누어 표시한다", () => {
  assert.equal(formatDamage(10000), "10k");
  assert.equal(formatDamage(18050.907204854964), "18.05k");
  assert.equal(formatDamage(52329.69945303521), "52.33k");
});

test("100품 70강 망집은 12.65k가 아니라 126.53k로 표시한다", () => {
  const result = calculate(weapon("망집"), 70, 100);
  assertClose(result.min, 63264.11);
  assertClose(result.max, 126528.23);
  assert.equal(formatDamage(result.max), "126.53k");
});

test("m·b·t 단위와 불필요한 소수점은 올바르게 처리한다", () => {
  assert.equal(formatDamage(1000000), "1m");
  assert.equal(formatDamage(1250000), "1.25m");
  assert.equal(formatDamage(1000000000), "1b");
  assert.equal(formatDamage(1000000000000), "1t");
});
