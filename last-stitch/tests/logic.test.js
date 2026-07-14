"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

/* ---------------- parseConfig ---------------- */

test("parseConfig: 未指定(null)は全て既定値", () => {
  const c = L.parseConfig(null);
  assert.deepEqual(c, {
    drag: 110,
    hint: 1,
    scissors: 3,
    unravelMs: 900,
    settleMs: 420,
    mistakes: 3
  });
});

test("parseConfig: URLSearchParams から上書き", () => {
  const c = L.parseConfig(new URLSearchParams("drag=200&hint=2&scissors=5"));
  assert.equal(c.drag, 200);
  assert.equal(c.hint, 2);
  assert.equal(c.scissors, 5);
  assert.equal(c.unravelMs, 900); // 未指定は既定
});

test("parseConfig: プレーンオブジェクトからも読める", () => {
  const c = L.parseConfig({ drag: "150", unravelMs: "1200" });
  assert.equal(c.drag, 150);
  assert.equal(c.unravelMs, 1200);
});

test("parseConfig: 異常値(0・負・非数・空)は既定値へフォールバック", () => {
  const c = L.parseConfig({ drag: "0", hint: "-3", scissors: "abc", unravelMs: "" });
  assert.equal(c.drag, 110);
  assert.equal(c.hint, 1);
  assert.equal(c.scissors, 3);
  assert.equal(c.unravelMs, 900);
});

test("parseConfig: hint/scissors は正の整数へ丸め、下限1", () => {
  const c = L.parseConfig({ hint: "2.7", scissors: "0.4" });
  assert.equal(c.hint, 3);
  assert.equal(c.scissors, 1);
});

/* ---------------- parseDebug ---------------- */

test("parseDebug: 未指定は false", () => {
  assert.equal(L.parseDebug(new URLSearchParams("")), false);
  assert.equal(L.parseDebug(null), false);
});

test("parseDebug: ?debug（値なし）・?debug=1 は true", () => {
  assert.equal(L.parseDebug(new URLSearchParams("debug")), true);
  assert.equal(L.parseDebug(new URLSearchParams("debug=1")), true);
  assert.equal(L.parseDebug(new URLSearchParams("debug=true")), true);
});

test("parseDebug: ?debug=0 は false", () => {
  assert.equal(L.parseDebug(new URLSearchParams("debug=0")), false);
});

test("parseDebug: プレーンオブジェクトでも一致した判定", () => {
  assert.equal(L.parseDebug({ debug: "1" }), true);
  assert.equal(L.parseDebug({ debug: "0" }), false);
  assert.equal(L.parseDebug({}), false);
});

/* ---------------- dragDistance / isDragSufficient ---------------- */

test("dragDistance: 3-4-5 の直角三角形は5", () => {
  assert.equal(L.dragDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("dragDistance: 同一点は0", () => {
  assert.equal(L.dragDistance({ x: 7, y: 7 }, { x: 7, y: 7 }), 0);
});

test("dragDistance: null/不正入力は0（例外を投げない）", () => {
  assert.equal(L.dragDistance(null, { x: 1, y: 1 }), 0);
  assert.equal(L.dragDistance({ x: 0, y: 0 }, null), 0);
  assert.equal(L.dragDistance({ x: NaN, y: 0 }, { x: 1, y: 1 }), 0);
});

test("isDragSufficient: 閾値ちょうどは満たす（>=）", () => {
  assert.equal(L.isDragSufficient(110, 110), true);
  assert.equal(L.isDragSufficient(109.9, 110), false);
  assert.equal(L.isDragSufficient(200, 110), true);
});

test("isDragSufficient: 非数は false", () => {
  assert.equal(L.isDragSufficient(NaN, 110), false);
  assert.equal(L.isDragSufficient(120, NaN), false);
});

/* ---------------- deriveSolutionOrder / nextExpectedId ---------------- */

test("deriveSolutionOrder: 既定は8家具すべてをage降順", () => {
  const order = L.deriveSolutionOrder();
  assert.deepEqual(order, [
    "rug", "blanket", "scarf", "socks", "teacosy", "mittens", "hat", "cushion"
  ]);
});

test("家具の記憶順は8段で一意に進む", () => {
  const order = L.deriveSolutionOrder();
  assert.equal(order.length, 8);
  assert.equal(new Set(order).size, 8);
});

test("腹の証言: 最初の各条件は単独では答えを確定しない", () => {
  const clues = L.cluesForProgress(0);
  clues.forEach((clue) => {
    assert.ok(L.candidateIdsForClues(L.DEFAULT_OBJECTS, [clue], []).length > 1);
  });
});

test("deriveSolutionOrder: 入力順に依らずage降順で安定", () => {
  const shuffled = [
    { id: "b", age: 1 }, { id: "a", age: 3 }, { id: "t", age: 4 }, { id: "c", age: 2 }
  ];
  assert.deepEqual(L.deriveSolutionOrder(shuffled), ["t", "a", "c", "b"]);
});

test("nextExpectedId: 最古から次点へ", () => {
  assert.equal(L.nextExpectedId(L.DEFAULT_OBJECTS, []), "rug");
  assert.equal(L.nextExpectedId(L.DEFAULT_OBJECTS, ["rug"]), "blanket");
});

test("nextExpectedId: 全てほどくと null", () => {
  const done = L.deriveSolutionOrder();
  assert.equal(L.nextExpectedId(L.DEFAULT_OBJECTS, done), null);
});

/* ---------------- evaluateUnravel ---------------- */

test("evaluateUnravel: 二番目以降を先に引くとほどけない", () => {
  const r = L.evaluateUnravel(L.DEFAULT_OBJECTS, [], "rug");
  assert.deepEqual(r, { ok: true, reason: "order-correct" });
});

test("evaluateUnravel: 最古の家具は order-correct", () => {
  const r = L.evaluateUnravel(L.DEFAULT_OBJECTS, [], "rug");
  assert.equal(r.ok, true);
  assert.equal(r.reason, "order-correct");
});

test("evaluateUnravel: 新しい家具を先に引くと order-wrong", () => {
  const r = L.evaluateUnravel(L.DEFAULT_OBJECTS, [], "blanket");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "order-wrong");
});

test("evaluateUnravel: 既にほどき済みは already", () => {
  const r = L.evaluateUnravel(L.DEFAULT_OBJECTS, ["blanket"], "blanket");
  assert.deepEqual(r, { ok: false, reason: "already" });
});

test("evaluateUnravel: 存在しないidは unknown", () => {
  const r = L.evaluateUnravel(L.DEFAULT_OBJECTS, [], "nope");
  assert.deepEqual(r, { ok: false, reason: "unknown" });
});

test("evaluateUnravel: age が同値でもidで一意順になる", () => {
  const objs = [
    { id: "x", age: 2 }, { id: "y", age: 2 }, { id: "z", age: 1 }
  ];
  assert.equal(L.evaluateUnravel(objs, [], "x").ok, true);
  assert.equal(L.evaluateUnravel(objs, [], "y").ok, false);
  assert.equal(L.evaluateUnravel(objs, [], "z").ok, false);
});

test("evaluateUnravel: 8家具の途中も古い順だけ正解", () => {
  const done = ["rug", "blanket", "scarf"];
  assert.equal(L.evaluateUnravel(L.DEFAULT_OBJECTS, done, "socks").ok, true);
  assert.equal(L.evaluateUnravel(L.DEFAULT_OBJECTS, done, "mittens").ok, false);
});

/* ---------------- windProgress ---------------- */

test("windProgress: ほどき数/全数を0..1で返す", () => {
  assert.equal(L.windProgress(0, 8), 0);
  assert.equal(L.windProgress(4, 8), 0.5);
  assert.equal(L.windProgress(8, 8), 1);
});

test("windProgress: 範囲外は0..1にクランプ", () => {
  assert.equal(L.windProgress(-3, 8), 0);
  assert.equal(L.windProgress(20, 8), 1);
});

test("windProgress: 非数・0以下の全数は0（例外を投げない）", () => {
  assert.equal(L.windProgress(NaN, 8), 0);
  assert.equal(L.windProgress(4, 0), 0);
  assert.equal(L.windProgress(4, NaN), 0);
});

/* ---------------- isComplete ---------------- */

test("isComplete: 8家具すべてでのみ true", () => {
  const required = L.deriveSolutionOrder();
  assert.equal(L.isComplete(L.DEFAULT_OBJECTS, required), true);
  assert.equal(L.isComplete(L.DEFAULT_OBJECTS, required.slice(0, -1)), false);
});

test("isComplete: 空オブジェクト集合は false（境界）", () => {
  assert.equal(L.isComplete([], []), false);
});

/* ---------------- computeHintLevel / advanceHintLevel ---------------- */

test("computeHintLevel: step=1 で 0/1/2/3、以降は3で頭打ち", () => {
  assert.equal(L.computeHintLevel(0, 1), 0);
  assert.equal(L.computeHintLevel(1, 1), 1);
  assert.equal(L.computeHintLevel(2, 1), 2);
  assert.equal(L.computeHintLevel(3, 1), 3);
  assert.equal(L.computeHintLevel(9, 1), 3);
});

test("computeHintLevel: step=2 は誤操作2回ごとに1段", () => {
  assert.equal(L.computeHintLevel(1, 2), 0);
  assert.equal(L.computeHintLevel(2, 2), 1);
  assert.equal(L.computeHintLevel(4, 2), 2);
  assert.equal(L.computeHintLevel(6, 2), 3);
});

test("computeHintLevel: 負・非数のstepは1扱い、負のwrongは0", () => {
  assert.equal(L.computeHintLevel(-5, 1), 0);
  assert.equal(L.computeHintLevel(3, 0), 3);
  assert.equal(L.computeHintLevel(3, NaN), 3);
});

test("advanceHintLevel: 段は後戻りしない", () => {
  assert.equal(L.advanceHintLevel(2, 1, 1), 2); // 誤操作1回(=段1)でも既に段2なら維持
  assert.equal(L.advanceHintLevel(1, 3, 1), 3); // 前進
});

/* ---------------- registerScissorUse ---------------- */

test("registerScissorUse: 既定3回目でBAD END", () => {
  assert.deepEqual(L.registerScissorUse(0, 3), { count: 1, badEnd: false });
  assert.deepEqual(L.registerScissorUse(1, 3), { count: 2, badEnd: false });
  assert.deepEqual(L.registerScissorUse(2, 3), { count: 3, badEnd: true });
});

test("registerScissorUse: limit=1 は初回でBAD END（境界）", () => {
  assert.deepEqual(L.registerScissorUse(0, 1), { count: 1, badEnd: true });
});

test("registerScissorUse: 不正limitは既定(3)扱い", () => {
  assert.equal(L.registerScissorUse(2, "x").badEnd, true);
});

/* ---------------- 状態機械 reduce ---------------- */

function fresh() {
  return L.createInitialState();
}

test("createInitialState: 初期は title / 進行ゼロ", () => {
  const s = fresh();
  assert.equal(s.phase, "title");
  assert.deepEqual(s.unraveled, []);
  assert.equal(s.wrongCount, 0);
  assert.equal(s.hintLevel, 0);
  assert.equal(s.scissorCount, 0);
});

test("reduce: 不正action/nullは状態を変えない", () => {
  const s = fresh();
  assert.equal(L.reduce(s, null), s);
  assert.equal(L.reduce(s, {}), s);
  assert.equal(L.reduce(s, { type: "UNKNOWN" }), s);
});

test("reduce: START は title→room のみ", () => {
  const s = L.reduce(fresh(), { type: "START" });
  assert.equal(s.phase, "room");
  // room で再度 START しても遷移しない
  assert.equal(L.reduce(s, { type: "START" }).phase, "room");
});

test("reduce: PULL_EDGE は title では動かない（edge-stuck）", () => {
  const s = L.reduce(fresh(), { type: "PULL_EDGE" });
  assert.equal(s.phase, "title");
  assert.equal(s.lastEvent, "edge-stuck");
});

test("reduce: UNRAVEL は room 以外では無視される", () => {
  const s = fresh(); // title
  assert.equal(L.reduce(s, { type: "UNRAVEL", targetId: "scarf" }), s);
});

test("reduce: 古い順で unraveled に積まれる（非破壊）", () => {
  let s = L.reduce(fresh(), { type: "START" });
  const before = s.unraveled;
  s = L.reduce(s, { type: "UNRAVEL", targetId: "rug" });
  assert.deepEqual(s.unraveled, ["rug"]);
  assert.deepEqual(before, []); // 元配列は破壊しない
  assert.equal(s.lastEvent, "unravel-ok");
});

test("reduce: 誤順で wrongCount 増・ヒント前進・unraveledは不変", () => {
  let s = L.reduce(fresh(), { type: "START" });
  s = L.reduce(s, { type: "UNRAVEL", targetId: "blanket" }); // 誤順
  assert.equal(s.wrongCount, 1);
  assert.equal(s.hintLevel, 1);
  assert.equal(s.lastEvent, "unravel-wrong");
  assert.deepEqual(s.unraveled, []);
});

test("reduce: 誤順3回で糸にされBAD END", () => {
  let s = L.reduce(fresh(), { type: "START" });
  for (let i = 0; i < 3; i++) {
    s = L.reduce(s, { type: "UNRAVEL", targetId: "blanket" });
  }
  assert.equal(s.wrongCount, 3);
  assert.equal(s.hintLevel, 3);
  assert.equal(s.phase, "badEnd");
  assert.equal(s.lastEvent, "temper-badend");
});

test("reduce: 誤接続は家具をほどかず誤答だけを数える", () => {
  let s = L.reduce(fresh(), { type: "START" });
  s = L.reduce(s, { type: "CONNECTION_WRONG", targetId: "rug" });
  assert.deepEqual(s.unraveled, []);
  assert.equal(s.wrongCount, 1);
  assert.equal(s.lastEvent, "unravel-wrong");
});

test("reduce: 誤接続3回でBAD END", () => {
  let s = L.reduce(fresh(), { type: "START" });
  for (let i = 0; i < 3; i++) s = L.reduce(s, { type: "CONNECTION_WRONG" });
  assert.equal(s.phase, "badEnd");
  assert.equal(s.wrongCount, 3);
});

test("reduce: 誤接続後も同じ正解家具を再試行できる", () => {
  let s = L.reduce(fresh(), { type: "START" });
  s = L.reduce(s, { type: "CONNECTION_WRONG", targetId: "rug" });
  assert.equal(L.nextExpectedId(s.objects, s.unraveled), "rug");
  s = L.reduce(s, { type: "UNRAVEL", targetId: "rug" });
  assert.deepEqual(s.unraveled, ["rug"]);
  assert.equal(s.phase, "room");
});

test("reduce: 既にほどき済みへの再ほどきは誤操作に数えない", () => {
  let s = L.reduce(fresh(), { type: "START" });
  s = L.reduce(s, { type: "UNRAVEL", targetId: "rug" });
  s = L.reduce(s, { type: "UNRAVEL", targetId: "rug" }); // already
  assert.equal(s.wrongCount, 0);
  assert.equal(s.lastEvent, "noop-already");
});

test("reduce: 正順で全ほどき→epilogue へ、PULL_EDGE で goodEnd", () => {
  let s = L.reduce(fresh(), { type: "START" });
  const order = L.deriveSolutionOrder();
  order.forEach((id) => {
    s = L.reduce(s, { type: "UNRAVEL", targetId: id });
  });
  assert.equal(s.phase, "epilogue");
  assert.equal(s.lastEvent, "complete");
  s = L.reduce(s, { type: "PULL_EDGE" });
  assert.equal(s.phase, "goodEnd");
  assert.equal(s.lastEvent, "edge-release");
});

test("reduce: ハサミ3回目で badEnd、以降 UNRAVEL は無視", () => {
  let s = L.reduce(fresh(), { type: "START" });
  s = L.reduce(s, { type: "USE_SCISSORS" });
  assert.equal(s.lastEvent, "scissor-flee");
  s = L.reduce(s, { type: "USE_SCISSORS" });
  s = L.reduce(s, { type: "USE_SCISSORS" });
  assert.equal(s.phase, "badEnd");
  assert.equal(s.lastEvent, "scissor-badend");
  // badEnd では UNRAVEL 無視
  assert.equal(L.reduce(s, { type: "UNRAVEL", targetId: "scarf" }), s);
});

test("reduce: RESTART は初期状態へ戻す", () => {
  let s = L.reduce(fresh(), { type: "START" });
  s = L.reduce(s, { type: "UNRAVEL", targetId: "blanket" });
  s = L.reduce(s, { type: "RESTART" });
  assert.equal(s.phase, "title");
  assert.deepEqual(s.unraveled, []);
});

test("reduce: カスタムscissors設定が反映される（config経由）", () => {
  const cfg = L.parseConfig({ scissors: 1 });
  let s = L.createInitialState(undefined, cfg);
  s = L.reduce(s, { type: "START" });
  s = L.reduce(s, { type: "USE_SCISSORS" });
  assert.equal(s.phase, "badEnd"); // 1回でBAD END
});
