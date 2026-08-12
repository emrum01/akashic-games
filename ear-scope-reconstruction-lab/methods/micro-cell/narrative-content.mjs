import WORLD_ASSET_MANIFEST from "./generated/world-content/micro-cell-narrative-v1/manifest.json" with { type: "json" };

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

const branch = (id, label, lines) => freeze({ id, label, lines: lines.map((line) => freeze(line)) });
const line = (speaker, text) => freeze({ speaker, text });

export const NARRATIVE_WORLD_ASSET_ROOT = "./generated/world-content/micro-cell-narrative-v1";

const approvedAsset = (itemId) => {
  const record = WORLD_ASSET_MANIFEST.assets[itemId];
  if (!record || record.raw !== false || record.mode !== "RGBA") return null;
  return freeze({
  path: `${NARRATIVE_WORLD_ASSET_ROOT}/${record.path.replace(/^\.\//, "")}`,
  sha256: record.sha256,
  width: record.width,
  height: record.height,
  rgba: record.mode === "RGBA",
  raw: record.raw,
  approved: true,
  visibleAlphaBounds: record.visibleBbox,
  thumbnail: freeze({
    path: `${NARRATIVE_WORLD_ASSET_ROOT}/${record.thumbnail.replace(/^\.\//, "")}`,
    width: 128,
    height: 128,
    rgba: true,
    raw: false,
    approved: true
  })
  });
};

export const NARRATIVE_WORLD_ITEMS = freeze({
  glass_jar: { name: "透明びん", asset: approvedAsset("glass_jar") },
  amber_bottle: { name: "琥珀の小瓶", asset: approvedAsset("amber_bottle") },
  brass_clasp: { name: "真鍮留め", asset: approvedAsset("brass_clasp") },
  lidded_bowl: { name: "蓋つき器", asset: approvedAsset("lidded_bowl") },
  wax_thread: { name: "琥珀の編み糸", asset: approvedAsset("wax_thread") },
  loose_page: { name: "抜け頁", asset: approvedAsset("loose_page") },
  mirror_light_conduit: { name: "鏡面導光管", asset: approvedAsset("mirror_light_conduit") },
  sun_filament: { name: "太陽の細光", asset: approvedAsset("sun_filament") }
});

export const NARRATIVE_WORLD_PLACEMENTS = freeze([
  { id: "pickup.glass-jar", itemId: "glass_jar", owner: "exact", nodes: ["z000", "z001", "z002"], anchor: [585, 760], visualSize: [58, 96], unlock: { type: "initial" }, priority: 40 },
  { id: "pickup.amber-bottle", itemId: "amber_bottle", owner: "exact", nodes: ["z000", "z001", "z002"], anchor: [730, 695], visualSize: [52, 88], unlock: { type: "initial" }, priority: 42 },
  { id: "pickup.brass-clasp", itemId: "brass_clasp", owner: "exact", nodes: ["z000", "z001", "z002", "z003"], anchor: [865, 750], visualSize: [72, 48], unlock: { type: "initial" }, priority: 44 },
  { id: "pickup.lidded-bowl", itemId: "lidded_bowl", owner: "room", nodes: ["z010", "z011", "w000", "w001"], anchor: [830, 684], visualSize: [76, 56], unlock: { type: "initial" }, priority: 41, surface: "coffee-table" },
  { id: "drop.wax-thread", itemId: "wax_thread", owner: "room", nodes: ["z010", "z011", "w000", "w001"], anchor: [688, 642], visualSize: [118, 58], unlock: { type: "grandma-resolved" }, priority: 45 },
  { id: "drop.loose-page", itemId: "loose_page", owner: "stage-s001", nodes: ["s001"], anchor: [704, 748], visualSize: [126, 70], unlock: { type: "encounter-resolved", encounterId: "booklion" }, priority: 45, surface: "floor", transform: "perspective(180px) rotateX(63deg) rotateZ(-4deg)", contactShadow: true },
  { id: "drop.mirror-light-conduit", itemId: "mirror_light_conduit", owner: "stage-s003", nodes: ["s003"], anchor: [650, 795], visualSize: [230, 105], unlock: { type: "encounter-resolved", encounterId: "construction_worker", unlockId: "drop.mirror-light-conduit" }, priority: 45 },
  { id: "drop.sun-filament", itemId: "sun_filament", owner: "stage-s009", nodes: ["s009"], anchor: [706, 760], visualSize: [124, 86], unlock: { type: "encounter-resolved", encounterId: "smiling_sun" }, priority: 45 }
]);

export const NARRATIVE_AMBIENT_EVENTS = freeze({
  "ambient.frames-forget-name": { nodeId: "z001", text: "額を見直しても、名札にあったはずの名前だけ思い出せない。", durationMs: 2800 },
  "ambient.lamp-answers-brain": { nodeId: "z003", text: "琥珀色の灯りの下で、脳残存率の数字を同じ拍で数えてしまう。", durationMs: 2800 },
  "ambient.seams-converge": { nodeId: "z006", text: "壁、扉、絨毯の継ぎ目は、どれも奥の窓へ続く構造に見える。", durationMs: 3000 }
});

export const NARRATIVE_TALKS = freeze({
  grandma: [
    branch("grandma.identity", "あなたは誰ですか", [line("player", "あなたは誰ですか"), line("grandma", "名前は置いてきたよ。ここへ入るには、重すぎたからねえ。"), line("player", "本当に忘れたの？"), line("grandma", "忘れた人の手つきだけ借りたの。世話をする手は、名前がなくても動くでしょう。")]),
    branch("grandma.waiting", "何を待っているの？", [line("player", "何を待っているの？"), line("grandma", "窓の向こうで、白い廊下が口を開けるのを。"), line("player", "ここは家じゃない？"), line("grandma", "待つ場所には家の形が要るのよ。ほんとうの壁なら、こんなに同じ縫い目へ戻らない。")])
  ],
  clown: [
    branch("clown.balloon", "風船には何が入っている？", [line("player", "その風船には何が入っている？"), line("clown", "なくした名前。割らなければ、ずっと安全。"), line("player", "誰の名前？"), line("clown", "次に忘れるきみの名前。だから、まだ空っぽだよ。")]),
    branch("clown.mouth", "腹の口は光が苦手？", [line("player", "腹の口は光が苦手？"), line("clown", "光は平気。丸い光が嫌い。出口と間違えて、口が勝手に飛びこむから。"), line("player", "瓶の底みたいな光？"), line("clown", "それは言っちゃだめ。遊びが一つ減る。")])
  ],
  flower_seller: [
    branch("flower.price", "花の値段は？", [line("player", "花の値段は？"), line("flower_seller", "水一滴か、昨日を一つ。琥珀色なら、瓶ごとで足りる。"), line("player", "昨日を渡すと？"), line("flower_seller", "花が咲いて、あなたは代金を忘れる。公平でしょう。")]),
    branch("flower.roots", "根はどこへ伸びている？", [line("player", "根はどこへ伸びている？"), line("flower_seller", "床の下。あなたの方へは伸びていないわ。"), line("player", "茎がこちらを向いている。"), line("flower_seller", "では急いで。乾いた花は、いちばん近い記憶から水を取る。")])
  ],
  booklion: [
    branch("booklion.read", "頭の本を読めばいい？", [line("player", "頭の本を読めばいい？"), line("booklion", "最初から、最後まで。途中だけ読むと、ぼくが途中の生き物になる。"), line("player", "今は一頁だけなら？"), line("booklion", "影を床に置く者は、文字の上へ立てない。そこだけ覚えて。")]),
    branch("booklion.guard", "ここを守っているの？", [line("player", "ここを守っているの？"), line("booklion", "もちろん。戦いになれば、勇敢に先頭を——"), line("player", "出口の方を見ている。"), line("booklion", "退路の安全確認だよ。とても大事な勇気だ。")])
  ],
  construction_worker: [
    branch("worker.order", "誰の命令で閉鎖している？", [line("player", "誰の命令で閉鎖している？"), line("construction_worker", "上だ。上の、もっと上。"), line("player", "この船に上階はない。"), line("construction_worker", "なら現場判断だ。留め具が一本来るまで閉鎖。")]),
    branch("worker.baton", "灯棒は安全側を指す？", [line("player", "灯棒が安全側を指している？"), line("construction_worker", "赤い側には立つな。柵が倒れれば、反対へ抜けろ。"), line("player", "留め具があれば倒れない。"), line("construction_worker", "そういう話を、資材係にしてくれ。")])
  ],
  smiling_priest: [
    branch("priest.ring", "白い輪は祝福？", [line("player", "その白い輪は祝福？"), line("smiling_priest", "名前を逃がさないための輪です。祝福と呼べば、皆おとなしく入る。"), line("player", "締めつけるのでは？"), line("smiling_priest", "飢えだけを。近くの記憶まで軋むのは、ほんの副作用です。")]),
    branch("priest.ship", "青い画面は何を数える？", [line("player", "青い画面は何を数えている？"), line("smiling_priest", "保存された名前です。消えた画面ほど、熱心に数えます。"), line("player", "あなたは名前を守る？"), line("smiling_priest", "輪の中へ置くのです。守ることと閉じこめることは、よく似ている。")])
  ],
  ninja: [
    branch("ninja.shadow", "影だけが動いていない", [line("player", "影だけが動いていない。"), line("ninja", "『影はない』"), line("player", "頁なら影の上へ置ける。"), line("ninja", "『読むな。記録になる』")]),
    branch("ninja.ship", "何から隠れている？", [line("player", "何から隠れている？"), line("ninja", "『船の目』"), line("player", "目はどこに？"), line("ninja", "『青い画面。消えていても数えている』")])
  ],
  beggar: [
    branch("beggar.payment", "何がほしい？", [line("player", "何がほしい？"), line("beggar", "もう使わない記憶を一つ。名前の最後の音など軽くていい。"), line("player", "いらないかどうか、誰が決める？"), line("beggar", "器です。空腹な器ほど、よく選びます。")]),
    branch("beggar.bowl", "蓋をした器なら？", [line("player", "蓋をした器なら？"), line("beggar", "中身がなくても、閉じていれば満ちたふりができる。"), line("player", "それで通してくれる？"), line("beggar", "ふりを信じるのが、私の唯一の礼儀です。")])
  ],
  smiling_sun: [
    branch("sun.light", "光は誰に当たる？", [line("player", "光は誰に当たる？"), line("smiling_sun", "暗いもの全部！　敵も、影も、琥珀の大きなゼリーも。"), line("player", "脳塊も焼くの？"), line("smiling_sun", "明るくなるよ。なくなるまで、とても明るい。")]),
    branch("sun.guide", "光を一本へ絞れる？", [line("player", "鏡面導光管へ流せる？"), line("smiling_sun", "鏡の管へ通せば、細い一本だけ選べる。"), line("player", "白い輪では？"), line("smiling_sun", "輪は閉じこめるもの。光を選ぶのは、鏡が並んだ細い道。")])
  ],
  segmented_glutton_larva: [
    branch("boss.food", "それは誰の脳？", [line("player", "それは誰の脳？"), line("segmented_glutton_larva", "だれのでもない。捨てた名前は、だれのでもない。"), line("player", "表示盤は保存中と示している。"), line("segmented_glutton_larva", "保存は、あとで食べるという意味。")]),
    branch("boss.satisfaction", "食べ終えたら何をする？", [line("player", "食べ終えたら何をする？"), line("segmented_glutton_larva", "みんなの声で、満足したと言う。"), line("player", "本人の声ではない。"), line("segmented_glutton_larva", "食べた声は、ぼくの声。だから嘘ではない。")])
  ]
});

export const NARRATIVE_REACTIONS = freeze({
  clown: {
    glass_jar: { attack: "透明びんを振り下ろさず、腹の口へかぶせる。", reaction: "口は丸い反射を出口と思って飛びこみ、硝子の内側で歯を鳴らす。" },
    ear_pick_strike: { attack: "耳かきの柄で笑顔の中心を殴る。", reaction: "道化師は避け、腹の口が名前の記憶を一口かじる。" },
    ear_pick_beam: { attack: "細い光線を風船へ走らせる。", reaction: "割れた風船から借り物の声が溢れ、腹の口がその陰で記憶をかじる。" },
    recruit: { attack: "手を差し出す。", reaction: "道化師は従うふりで一礼し、背後からこちらの呼び名を試食する。" }
  },
  flower_seller: {
    amber_bottle: { attack: "琥珀の小瓶を花束の根元へ置く。", reaction: "根はプレイヤーから離れ、瓶の光を抱いて静まる。" },
    ear_pick_strike: { attack: "耳かきの柄を花束の茎へ振る。", reaction: "折れた茎から太い根が伸び、保存中の記憶へ刺さる。" },
    ear_pick_beam: { attack: "花束へ細い光線を走らせる。", reaction: "乾いた花弁が光を散らし、細い根が脳塊へ伸びる。" },
    recruit: { attack: "同行を持ちかける。", reaction: "花売りは空の値札へプレイヤーの名を書き、根を巻き取る。" }
  },
  booklion: {
    recruit: { attack: "頭の本を読むと約束する。", reaction: "本ライオンは頁を一枚抜き、『あとで続きを』と頭を低くする。" },
    ear_pick_strike: { attack: "耳かきの柄を構える。", reaction: "本ライオンは栞と抜け頁を残し、白い廊下の奥へ逃げる。" },
    ear_pick_beam: { attack: "開いた頁へ光線を向ける。", reaction: "光風で頁が一枚ちぎれ、本ライオンはその後を追って逃げる。" }
  },
  construction_worker: {
    brass_clasp: { attack: "空いた蝶番へ真鍮留めを押しこむ。", reaction: "柵はまっすぐ立ち、作業員は通路側へ退く。" },
    ear_pick_strike: { attack: "耳かきの柄で柵を押し返す。", reaction: "留め具のない蝶番が外れ、柵の衝撃が保存中の脳へ伝わる。" },
    ear_pick_beam: { attack: "蝶番へ光線を当てる。", reaction: "熱で歪んだ柵が倒れ、床の振動が保存中の脳へ伝わる。" }
  },
  smiling_priest: {
    recruit: { attack: "白い輪の使い道を問う。", reaction: "司祭は輪を自分の首から外し、道化師へ向けて携える。" },
    ear_pick_strike: { attack: "耳かきの柄で白い輪を叩く。", reaction: "輪の破片が壁を鳴らし、脳塊を吊るす機構まで震わせる。" },
    ear_pick_beam: { attack: "白い輪へ光線を通す。", reaction: "輪唱が光を増幅し、青い表示盤と脳塊を同時に震わせる。" }
  },
  ninja: {
    ear_pick_strike: { attack: "本体ではなく、床に残る影を耳かきで払う。", reaction: "影がほどけ、忍者の輪郭が遅れて床へ戻る。" },
    ear_pick_beam: { attack: "床の影を避け、本体へ細い光線を向ける。", reaction: "光で本体だけが消え、残った影から手裏剣が飛ぶ。" },
    loose_page: { attack: "本の抜け頁を影へ重ねる。", reaction: "影が文字として頁へ移り、忍者は記録されたことを認める。" },
    recruit: { attack: "影へ同行を持ちかける。", reaction: "忍者は一枚の札だけを残し、プレイヤーの背後の影へ移る。" },
    default: { attack: "本体へ光線を向ける。", reaction: "光で本体だけが消え、残った影から手裏剣が飛ぶ。" }
  },
  beggar: {
    lidded_bowl: { attack: "蓋つき器を両手の前へ置く。", reaction: "物乞いは満ちたふりを受け取り、こちらの記憶から手を離す。" },
    recruit: { attack: "器ごと同行を持ちかける。", reaction: "物乞いは器の内側へ自分の顔を映し、それを過去として抱く。" },
    ear_pick_strike: { attack: "耳かきの柄で空の器を押し返す。", reaction: "器が打撃の記憶を吸い、脳残存率の一部を持ち去る。" },
    ear_pick_beam: { attack: "器の底へ光線を向ける。", reaction: "器は光の記憶ごと脳残存率の一部を吸いこむ。" }
  },
  smiling_sun: {
    mirror_light_conduit: { attack: "鏡面導光管の継手を太陽へ向ける。", reaction: "管内で反射した光が一本へ絞られ、脳塊の方向を避ける。" },
    recruit: { attack: "軌道へ同行するよう呼ぶ。", reaction: "太陽は近づく喜びで膨らみ、脳塊の表面を焼く。" },
    ear_pick_beam: { attack: "太陽の光へ耳かきビームを重ねる。", reaction: "二本の光が壁で増幅し、保存中の脳塊をかすめる。" },
    ear_pick_strike: { attack: "耳かきの柄で光の中心を払う。", reaction: "散った光が壁で反射し、保存中の脳塊をかすめる。" }
  },
  segmented_glutton_larva: {
    ear_pick_strike: { attack: "耳かきの柄を白い継ぎ目か、スプーンを握る手へ振る。", reaction: "狙った節だけが皿の横へ落ちる。" },
    ear_pick_beam: { attack: "青白い神経へ細い光線を走らせる。", reaction: "光は脳塊の手前で止まり、神経だけを焼く。" },
    sun_filament: { attack: "太陽の細光を透明な糸へ通す。", reaction: "細光は露出神経だけを焼き、琥珀の脳塊を避ける。" },
    sever: { attack: "最後の神経を切る。", reaction: "幼虫の笑顔と給餌装置が同時に止まる。" },
    wax_thread: { attack: "琥珀の糸で神経を脳塊から引き離す。", reaction: "束ねた神経だけが安全に切り離される。" },
    default: { attack: "幼虫へ攻撃を放つ。", reaction: "狙いを外した隙に、幼虫がスプーンで脳塊を一口運ぶ。" }
  }
});

export function narrativeBranchesFor(encounterId) {
  return NARRATIVE_TALKS[encounterId] || [];
}

export function narrativeReactionFor(encounterId, actionId) {
  const table = NARRATIVE_REACTIONS[encounterId] || {};
  return table[actionId] || table.default || null;
}

export function validateNarrativeContent({ validNodes = [], validOwners = [] } = {}) {
  const errors = [];
  const placementIds = new Set();
  for (const placement of NARRATIVE_WORLD_PLACEMENTS) {
    if (placementIds.has(placement.id)) errors.push(`duplicate placement ${placement.id}`);
    placementIds.add(placement.id);
    if (!NARRATIVE_WORLD_ITEMS[placement.itemId]) errors.push(`missing item ${placement.itemId}`);
    if (!validOwners.includes(placement.owner)) errors.push(`invalid owner ${placement.owner}`);
    for (const node of placement.nodes) if (!validNodes.includes(node)) errors.push(`invalid node ${node}`);
    if (placement.anchor.some((value) => !Number.isFinite(value)) || placement.visualSize.some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`invalid geometry ${placement.id}`);
  }
  const branchIds = new Set();
  for (const [encounterId, branches] of Object.entries(NARRATIVE_TALKS)) {
    if (branches.length < 1 || branches.length > 2) errors.push(`branch count ${encounterId}`);
    for (const entry of branches) {
      if (branchIds.has(entry.id)) errors.push(`duplicate branch ${entry.id}`);
      branchIds.add(entry.id);
      if (entry.lines.length < 2 || entry.lines.length > 4 || entry.lines.some(({ text }) => !text.trim())) errors.push(`invalid lines ${entry.id}`);
    }
  }
  return freeze({ valid: errors.length === 0, errors, placements: NARRATIVE_WORLD_PLACEMENTS.length, items: Object.keys(NARRATIVE_WORLD_ITEMS).length, talks: Object.keys(NARRATIVE_TALKS).length, branches: branchIds.size, approvedAssets: Object.values(NARRATIVE_WORLD_ITEMS).filter(({ asset }) => asset?.approved).length });
}
