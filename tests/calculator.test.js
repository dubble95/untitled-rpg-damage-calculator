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
    "globalThis.calculator = { WEAPONS, formatDamage, calculate, calculateQualityRange };"
  ].join("\n"),
  context
);

const { WEAPONS, formatDamage, calculate, calculateQualityRange } = context.calculator;
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
