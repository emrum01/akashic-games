const SOURCE_WIDTH = 1536;
const SOURCE_HEIGHT = 1024;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function xyxy([left, top, right, bottom]) {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function target(owner, bounds, nodes, visibility = "full") {
  const boxes = bounds?.type === "multi-bbox" ? bounds.boxes.map(xyxy) : [xyxy(bounds)];
  return { owner, boxes, nodes, visibility };
}

const STAGE_SCALES = [1, 1.15, 1.3225, 1.520875, 1.74900625];

function stageBox(bounds, scale) {
  const sx = Math.round(SOURCE_WIDTH * scale) / SOURCE_WIDTH;
  const sy = Math.round(SOURCE_HEIGHT * scale) / SOURCE_HEIGHT;
  const left = Math.round(768 * scale - 768);
  const top = Math.round(480 * scale - 480);
  const [x0, y0, x1, y1] = bounds;
  return [
    Math.max(0, sx * x0 - left),
    Math.max(0, sy * y0 - top),
    Math.min(SOURCE_WIDTH, sx * x1 - left),
    Math.min(SOURCE_HEIGHT, sy * y1 - top)
  ];
}

function stageTargets(prefix, bounds, first, last) {
  return STAGE_SCALES.slice(first - 1, last).map((scale, offset) => {
    const stage = first + offset;
    const nodeIndex = prefix === "near" ? stage - 1 : stage + 4;
    const node = `s${String(nodeIndex).padStart(3, "0")}`;
    return target(`stage-${node}`, stageBox(bounds, scale), [node], "stage-derived-exact");
  });
}

const KIND_NAMES = deepFreeze({
  picture: "絵",
  portrait: "写真",
  door: "扉",
  handle: "取っ手",
  lamp: "ランプ",
  box: "箱",
  dish: "皿",
  bowl: "器",
  jar: "瓶",
  sculpture: "置物",
  skull: "頭骨",
  window: "窓",
  "curtain-pair": "カーテン",
  bottle: "小瓶",
  "lidded-bowl": "蓋付きの器",
  "table-props": "卓上の金具",
  "sofa-detail": "ソファ",
  monitor: "シアンのモニター",
  jelly: "脳ゼリー",
  rig: "吊り機構",
  cable: "束線",
  larva: "白い幼生",
  face: "幼生の顔",
  plate: "皿",
  spoon: "スプーン",
  portion: "小分けのゼリー",
  strand: "口元の琥珀片",
  console: "操作卓",
  rack: "計器ラック",
  hatch: "床ハッチ"
  ,"warm-frame": "古い木枠"
  ,"star-window": "観測窓"
  ,indicator: "インジケータ"
  ,vent: "穴あき縦板"
  ,pipe: "主管"
  ,"ceiling-tray": "天井溝"
  ,pedestal: "操作台"
});

const DISPLAY_NAMES = deepFreeze({
  "cor.wall.tree-print": "左壁の枝絵",
  "cor.portrait.upper-pair": "上段の二人写真",
  "cor.portrait.oval-family": "楕円の家族写真",
  "cor.portrait.large-group": "縦長の集合写真",
  "cor.portrait.center-duo": "中央の二人写真",
  "cor.portrait.dark-single": "暗色の単独写真",
  "cor.portrait.lower-pair": "下段の二人写真",
  "cor.portrait.lower-single": "下段の単独写真",
  "cor.portrait.narrow-right": "右壁の細長写真",
  "cor.portrait.solo-right": "右端の単独写真",
  "cor.console.portrait": "卓上の額写真",
  "cor.cabinet.portrait-top": "棚上段の傾き写真",
  "cor.cabinet.portrait-mid": "棚中段の胸像写真",
  "cor.cabinet.portrait-low": "棚下段の暗色写真",
  "cor.door.left": "左側の木扉",
  "cor.door.handle-left": "木扉の真鍮取っ手",
  "cor.console.lamp": "左卓上の布笠灯",
  "cor.console.ornate-box": "卓端の彫り小箱",
  "cor.console.dish-left": "卓左端の白い浅皿",
  "cor.console.bowl-right": "卓上の黒い丸鉢",
  "cor.cabinet.specimen-jar": "棚上段の淡色瓶",
  "cor.cabinet.glass-jar": "棚中段の透明瓶",
  "cor.cabinet.shell-cluster": "棚中段の殻置物",
  "cor.cabinet.coral-lower": "棚下段の枝状置物",
  "cor.cabinet.skull-dark": "棚奥の暗色頭骨",
  "cor.cabinet.skull-pale": "棚下段の淡色頭骨",
  "room.wall.ancestor-art": "右壁の縦長額絵",
  "room.window.sheer": "中央の薄布窓",
  "room.curtains": "窓脇の厚手カーテン",
  "room.lamp": "ソファ右の背高灯",
  "room.side-table.bottle": "右卓上の琥珀色小瓶",
  "room.side-table.small-sculpture": "右卓上の曲面置物",
  "room.side-table.lower-box": "右卓下段の木箱",
  "room.coffee-table.lidded-bowl": "中央卓の蓋付き器",
  "room.coffee-table.brass-cluster": "中央卓の真鍮小物",
  "room.sofa.cushion-left": "ソファ左座面",
  "room.sofa.center-seam": "ソファ中央の縫い目",
  "room.sofa.cushion-right": "ソファ右座面",
  "portal.threshold.warm-frame": "通路入口の焦茶木枠",
  "portal.star-window.left": "入口左の星空窓",
  "portal.star-window.right": "入口右の反射窓",
  "portal.rack.left": "入口左の表示棚",
  "portal.rack.right": "入口右の配線棚",
  "portal.pedestal.left": "入口左の低い台",
  "portal.pedestal.right": "入口右の金属台",
  "portal.cables.left": "入口左天井の配管束",
  "portal.cables.right": "入口右天井の継手管",
  "portal.door": "入口奥の白い厚枠扉",
  "portal.door.center-detail": "白扉中央の金属部",
  "near.star-window.left": "左手前の星空窓",
  "near.star-window.right": "右手前の星空窓",
  "near.indicator.left": "左前柱の橙灯列",
  "near.indicator.right": "右前柱の橙灯列",
  "near.rack.front.left": "左手前の青表示棚",
  "near.rack.front.right": "右手前の橙灯棚",
  "near.rack.mid.left": "左中程の細い表示盤",
  "near.rack.mid.right": "右中程の小型計器列",
  "near.cables.base.left": "左床際の黒ホース",
  "near.cables.base.right": "右床際の青い接続箱",
  "near.door": "通路奥の両開き扉",
  "near.door.handles": "両開き扉の取っ手",
  "near.ceiling.tray": "中央天井の黒い溝",
  "deep.star-window.left": "左奥の大星窓",
  "deep.star-window.right": "右奥の疎星窓",
  "deep.vent.left": "左柱の穴あき縦板",
  "deep.vent.right": "右柱の縦格子板",
  "deep.pipe.left": "左壁の黒い二本管",
  "deep.pipe.right": "右壁の継手付き管",
  "deep.rack.front.left": "左前方の青表示棚",
  "deep.rack.front.right": "右前方の青画面箱",
  "deep.rack.mid.left": "左中程の小型表示盤",
  "deep.rack.mid.right": "右中程の露出配線棚",
  "deep.rack.far.left": "左最奥の細い青灯",
  "deep.rack.far.right": "右最奥の扉脇表示",
  "deep.boxes.base.left": "左床際の角形箱",
  "deep.boxes.base.right": "右床際の橙部品箱",
  "deep.door": "奥の中央縁付き扉",
  "deep.door.handles": "奥扉中央の対取っ手",
  "deep.ceiling.tray": "奥天井の黒い縦溝",
  "boss.monitor": "右壁のシアン画面",
  "boss.brain-jelly": "中央の琥珀色多房ゼリー",
  "boss.suspension-ring": "天井の白い多重リング",
  "boss.suspension-cables": "リング下の黒い束線",
  "boss.larva": "右床上の白い幼生",
  "boss.face": "幼生の丸目と大口",
  "boss.plate": "幼生が持つ白皿",
  "boss.spoon": "口元へ伸びるスプーン",
  "boss.portion": "白皿上のゼリー片",
  "boss.mouth-strand": "口元の琥珀色細片",
  "boss.star-window.left": "左壁の宇宙窓",
  "boss.console.left": "左窓下の青表示卓",
  "boss.rack.left": "左壁の小型計器棚",
  "boss.rack.right": "右壁の機器棚",
  "boss.floor-hatch": "中央床の円形ハッチ"
});

function object(id, kind, observation, targets, priority = 10) {
  return { id, kind, name: DISPLAY_NAMES[id] || KIND_NAMES[kind] || kind, observation, targets, priority };
}

const exactNodes = ["z000", "z001", "z002", "z003"];
const roomNodes = ["z010", "z011", "w000", "w001", "w002", "w003"];

const objects = [
  object("cor.wall.tree-print", "picture", "黄褐色の壁面に、細い枝を描いた縦長の額装画が掛かっている。", [
    target("exact", [135, 123, 316, 418], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.portrait.upper-pair", "portrait", "小さな矩形額に、肩を寄せた二人の古い肖像が収まっている。", [
    target("exact", [515, 264, 581, 340], exactNodes), target("detail", [284, 153, 387, 282], ["z004", "z005"]),
    target("z006", [0, 0, 54, 195], ["z006"], "partial")
  ], 20),
  object("cor.portrait.oval-family", "portrait", "楕円形の額に、正装した家族の肖像が褪色して残っている。", [
    target("exact", [579, 303, 648, 378], exactNodes), target("detail", [388, 220, 505, 337], ["z004", "z005"]),
    target("z006", [74, 79, 257, 282], ["z006"]), target("z007", [0, 45, 143, 261], ["z007"], "partial")
  ], 20),
  object("cor.portrait.large-group", "portrait", "縦長の額内に複数人が並び、暗い背景へ輪郭が沈んでいる。", [
    target("exact", [494, 352, 569, 471], exactNodes), target("detail", [245, 308, 369, 507], ["z004", "z005"], "z005-partial"),
    target("z006", [0, 270, 27, 566], ["z006"], "partial")
  ], 20),
  object("cor.portrait.center-duo", "portrait", "中央の小さな額には、二人の上半身が近い間隔で写っている。", [
    target("exact", [568, 372, 632, 460], exactNodes), target("detail", [376, 352, 461, 490], ["z004", "z005"]),
    target("z006", [46, 291, 193, 563], ["z006"]), target("z007", [0, 286, 45, 571], ["z007"], "partial")
  ], 20),
  object("cor.portrait.dark-single", "portrait", "黒ずんだ単独肖像は、細い金属枠の内側に収まっている。", [
    target("exact", [621, 383, 681, 450], exactNodes), target("detail", [476, 357, 556, 469], ["z004", "z005"]),
    target("z006", [211, 311, 345, 525], ["z006"]), target("z007", [91, 297, 236, 536], ["z007"]),
    target("z008", [0, 278, 117, 559], ["z008"], "partial")
  ], 20),
  object("cor.portrait.lower-pair", "portrait", "下段の横長額に、並んだ二人の肖像が掲げられている。", [
    target("exact", [538, 458, 601, 537], exactNodes), target("detail", [328, 496, 425, 621], ["z004", "z005"]),
    target("z006", [0, 606, 130, 800], ["z006"], "partial")
  ], 20),
  object("cor.portrait.lower-single", "portrait", "下段の小さな単独肖像は、明るい襟元だけが目立つ。", [
    target("exact", [604, 454, 648, 516], exactNodes), target("detail", [436, 480, 505, 587], ["z004", "z005"]),
    target("z006", [157, 568, 257, 718], ["z006"]), target("z007", [10, 603, 134, 777], ["z007"])
  ], 20),
  object("cor.portrait.narrow-right", "portrait", "右壁の細い縦額は、人物を全身に近い構図で収めている。", [
    target("exact", [900, 370, 935, 474], exactNodes), target("detail", [945, 345, 1008, 519], ["z004", "z005"]),
    target("z006", [1038, 266, 1143, 585], ["z006"]), target("z007", [1068, 267, 1165, 612], ["z007"]),
    target("z008", [1125, 241, 1224, 670], ["z008"]), target("z009", [1180, 199, 1297, 688], ["z009"])
  ], 20),
  object("cor.portrait.solo-right", "portrait", "右端の肖像は、濃色の衣服と明るい胸元の対比が強い。", [
    target("exact", [1024, 351, 1084, 449], exactNodes), target("detail", [1158, 319, 1269, 483], ["z004", "z005"]),
    target("z006", [1388, 254, 1536, 531], ["z006"], "partial"), target("z007", [1507, 234, 1536, 490], ["z007"], "partial")
  ], 20),
  object("cor.console.portrait", "portrait", "操作卓上の写真は、厚いガラス越しに淡く反射している。", [
    target("exact", [397, 578, 475, 683], exactNodes), target("detail", [57, 709, 184, 864], ["z004"], "partial")
  ], 20),
  object("cor.cabinet.portrait-top", "portrait", "棚上段の小さな額は、右へわずかに傾いたまま置かれている。", [
    target("exact", [1383, 271, 1446, 359], ["z000", "z001"], "z001-partial")
  ], 20),
  object("cor.cabinet.portrait-mid", "portrait", "棚中段の肖像は、木製枠の中央で人物の胸像を捉えている。", [
    target("exact", [1360, 564, 1441, 659], ["z000", "z001"], "z001-partial")
  ], 20),
  object("cor.cabinet.portrait-low", "portrait", "棚下段の暗い写真は、表面の褪色と細かな埃が目立つ。", [
    target("exact", [1365, 793, 1430, 887], ["z000", "z001"], "z001-partial")
  ], 20),
  object("cor.door.left", "door", "左側の木扉は縦板と矩形パネルで組まれ、壁面に奥行きを作る。", [
    target("exact", [669, 369, 730, 624], exactNodes), target("detail", [585, 360, 662, 730], ["z004", "z005"]),
    target("z006", [394, 140, 516, 947], ["z006"]), target("z007", [340, 83, 470, 1010], ["z007"]),
    target("z008", [256, 32, 380, 1024], ["z008"], "partial-bottom"), target("z009", [84, 0, 246, 1024], ["z009"], "partial")
  ], 15),
  object("cor.door.handle-left", "handle", "真鍮色の小さな取っ手は、扉の中ほどで鈍く光っている。", [
    target("exact", [699, 480, 719, 506], exactNodes), target("detail", [627, 547, 662, 594], ["z004", "z005"]),
    target("z006", [470, 634, 513, 691], ["z006"]), target("z007", [416, 640, 471, 708], ["z007"]),
    target("z008", [282, 675, 345, 755], ["z008"]), target("z009", [165, 676, 240, 756], ["z009"])
  ], 50),
  object("cor.console.lamp", "lamp", "布笠の卓上ランプが、左の操作卓へ暖色の光を落としている。", [
    target("exact", [174, 430, 350, 734], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.console.ornate-box", "box", "彫り模様の小箱は、操作卓の端に蓋を閉じて置かれている。", [
    target("exact", [322, 603, 410, 704], exactNodes, "z003-partial")
  ]),
  object("cor.console.dish-left", "dish", "浅い白皿は、卓上の左端で縁に暖色光を受けている。", [
    target("exact", [162, 737, 242, 786], ["z000", "z001"])
  ]),
  object("cor.console.bowl-right", "bowl", "黒い丸鉢は、低い縁と艶のない内面を持つ。", [
    target("exact", [261, 728, 330, 781], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.cabinet.specimen-jar", "jar", "棚上段の瓶は、淡色の不定形物をガラス越しに見せている。", [
    target("exact", [1245, 268, 1322, 374], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.cabinet.glass-jar", "jar", "透明瓶の曲面に室内灯が細く反射し、表面に曇りが残る。", [
    target("exact", [1302, 411, 1355, 508], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.cabinet.shell-cluster", "sculpture", "乳白色の殻状置物は、重なった稜線を上向きに広げている。", [
    target("exact", [1320, 453, 1400, 526], ["z000", "z001", "z002"], "z001-z002-partial")
  ]),
  object("cor.cabinet.coral-lower", "sculpture", "枝分かれした珊瑚状置物が、棚の下段へ横向きに置かれている。", [
    target("exact", [1275, 553, 1363, 634], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.cabinet.skull-dark", "skull", "暗色の頭骨標本は、眼窩を正面へ向けて棚奥に収まっている。", [
    target("exact", [1285, 696, 1351, 787], ["z000", "z001", "z002"], "z002-partial")
  ]),
  object("cor.cabinet.skull-pale", "skull", "淡色の頭骨標本は、摩耗した表面と細い亀裂が見える。", [
    target("exact", [1358, 744, 1434, 835], ["z000", "z001"], "z001-partial")
  ]),

  object("room.wall.ancestor-art", "picture", "室内右壁の額装画は、暗い地に人物像を縦構図で収めている。", [
    target("exact", [829, 418, 861, 466], exactNodes, "small"), target("detail", [816, 420, 889, 526], ["z004", "z005"]),
    target("z006", [815, 422, 890, 554], ["z006"]), target("z007", [810, 420, 899, 557], ["z007"]),
    target("z008", [806, 426, 912, 594], ["z008"]), target("z009", [799, 426, 930, 615], ["z009"]),
    target("room", [1034, 215, 1160, 377], roomNodes, "full-pc")
  ], 18),
  object("room.window.sheer", "window", "薄布越しの窓から、青白い外光が室内へ広がっている。", [
    target("exact", [758, 395, 817, 503], exactNodes, "small"), target("detail", [704, 385, 761, 531], ["z004", "z005"]),
    target("z006", [609, 356, 704, 641], ["z006"]), target("z007", [560, 347, 676, 643], ["z007"]),
    target("z008", [507, 333, 655, 722], ["z008"]), target("z009", [440, 319, 630, 743], ["z009"]),
    target("room", [582, 133, 860, 510], roomNodes)
  ], 12),
  object("room.curtains", "curtain-pair", "左右の厚いカーテンは、上部の飾り布と同系色で揃えられている。", [
    target("exact", [751, 378, 834, 524], exactNodes, "small"), target("detail", [696, 375, 812, 548], ["z004", "z005"]),
    target("z006", [606, 351, 790, 657], ["z006"]), target("z007", [557, 344, 779, 670], ["z007"]),
    target("z008", [505, 330, 772, 725], ["z008"]), target("z009", [438, 316, 755, 747], ["z009"]),
    target("room", { type: "multi-bbox", boxes: [[459, 91, 591, 512], [854, 91, 980, 512], [458, 91, 983, 151]] }, roomNodes, "full-pc")
  ], 11),
  object("room.lamp", "lamp", "背の高いフロアランプが、ソファ右側を暖色に照らしている。", [
    target("exact", [824, 433, 859, 538], exactNodes, "small"), target("detail", [803, 446, 870, 598], ["z004", "z005"]),
    target("z006", [790, 474, 884, 659], ["z006"]), target("z007", [789, 471, 886, 702], ["z007"]),
    target("z008", [781, 495, 907, 739], ["z008"]), target("z009", [775, 502, 917, 798], ["z009"]),
    target("room", [1004, 297, 1147, 551], ["z010", "z011", "w000", "w001", "w002"], "w003-pc-only-partial")
  ], 22),
  object("room.side-table.bottle", "bottle", "琥珀色の小瓶は、丸い胴と細い首に光を反射している。", [
    target("detail", [781, 516, 826, 590], ["z004", "z005"], "small"), target("z006", [771, 569, 824, 655], ["z006"]),
    target("z007", [777, 587, 830, 696], ["z007"]), target("z008", [762, 630, 829, 757], ["z008"]),
    target("z009", [756, 644, 826, 793], ["z009"]), target("room", [994, 409, 1061, 548], roomNodes, "w003-pc-partial")
  ], 30),
  object("room.side-table.small-sculpture", "sculpture", "卓上の小型置物は、曲面の表面にランプ光を反射している。", [
    target("detail", [865, 523, 894, 589], ["z004", "z005"], "small"), target("z006", [871, 569, 918, 656], ["z006"]),
    target("z007", [873, 609, 923, 697], ["z007"]), target("z008", [902, 632, 968, 755], ["z008"]),
    target("z009", [906, 638, 983, 798], ["z009"]), target("room", [1111, 491, 1164, 551], roomNodes, "full-pc")
  ], 30),
  object("room.side-table.lower-box", "box", "サイドテーブル下段の箱は、木目の前板と小さな引き手を備える。", [
    target("room", [1083, 575, 1192, 636], roomNodes, "full-pc")
  ], 15),
  object("room.coffee-table.lidded-bowl", "lidded-bowl", "コーヒーテーブル中央の器は、丸い蓋と低い台座を持つ。", [
    target("detail", [704, 552, 778, 602], ["z004", "z005"], "small"), target("z006", [612, 670, 715, 748], ["z006"]),
    target("z007", [555, 722, 691, 805], ["z007"]), target("z008", [524, 754, 680, 851], ["z008"]),
    target("z009", [475, 817, 675, 951], ["z009"]), target("room", [707, 647, 818, 742], roomNodes)
  ], 35),
  object("room.coffee-table.brass-cluster", "table-props", "真鍮色の小物が、テーブル左側に数点まとめて並んでいる。", [
    target("detail", [699, 550, 728, 596], ["z004", "z005"], "small"), target("z006", [606, 680, 652, 734], ["z006"]),
    target("z007", [553, 733, 611, 789], ["z007"]), target("z008", [508, 766, 576, 835], ["z008"]),
    target("z009", [452, 835, 540, 923], ["z009"]), target("room", [620, 665, 716, 742], roomNodes)
  ], 40),
  object("room.sofa.cushion-left", "sofa-detail", "左座面のクッションには、細かな織り目と深い折り皺がある。", [target("room", [483, 508, 620, 686], roomNodes)], 8),
  object("room.sofa.center-seam", "sofa-detail", "中央座面の縫い合わせが、二枚のクッションの境界をまっすぐ走る。", [target("room", [610, 505, 748, 697], roomNodes)], 9),
  object("room.sofa.cushion-right", "sofa-detail", "右座面のクッションは、背もたれ側に大きな皺が寄っている。", [target("room", [746, 507, 900, 688], roomNodes)], 8),

  object("portal.threshold.warm-frame", "warm-frame", "焦げ茶色の木枠が、白い船内通路との境界を横長に囲っている。", [target("portal", [282, 0, 1255, 97], ["wp000"])], 6),
  object("portal.star-window.left", "star-window", "左の観測窓には、暗い空間に疎らな星点が見える。", [target("portal", [324, 330, 444, 612], ["wp000"])], 15),
  object("portal.star-window.right", "star-window", "右の観測窓は、縁に白い室内灯を細く反射している。", [target("portal", [1093, 331, 1214, 612], ["wp000"])], 15),
  object("portal.rack.left", "rack", "左ラックは、青い表示器と橙色の灯を縦方向に積んでいる。", [target("portal", [461, 341, 545, 712], ["wp000"])], 20),
  object("portal.rack.right", "rack", "右ラックから、太い黒い束線が床方向へ垂れている。", [target("portal", [987, 340, 1076, 711], ["wp000"])], 20),
  object("portal.pedestal.left", "pedestal", "左の低い操作台が、壁面から通路側へ斜めに張り出す。", [target("portal", [542, 521, 612, 632], ["wp000"])], 30),
  object("portal.pedestal.right", "pedestal", "右の制御台は、壁から離れて低い脚部で床に立っている。", [target("portal", [922, 521, 998, 630], ["wp000"])], 30),
  object("portal.cables.left", "cable", "左天井隅では、白い配管と黒い束線が一か所へ集まる。", [target("portal", [326, 72, 552, 378], ["wp000"])], 10),
  object("portal.cables.right", "cable", "右の配管群は、継手を重ねながら奥の扉へ向かって細くなる。", [target("portal", [984, 72, 1210, 378], ["wp000"])], 10),
  object("portal.door", "door", "最奥の白い扉は、厚い外枠と重なった内側の縁を備える。", [target("portal", [703, 418, 837, 582], ["wp000"])], 25),
  object("portal.door.center-detail", "handle", "扉中央には、縦長の縁と小さな金属部が付いている。", [target("portal", [750, 479, 786, 552], ["wp000"])], 50),

  object("near.star-window.left", "star-window", "左観測窓の中央付近に、青白い明るい星点が見える。", stageTargets("near", [0, 205, 305, 715], 1, 3), 12),
  object("near.star-window.right", "star-window", "右観測窓には小さな星点が散り、中央に暗い余白がある。", stageTargets("near", [1230, 205, 1536, 715], 1, 3), 12),
  object("near.indicator.left", "indicator", "左前柱に、橙色の細い表示灯が縦列で並んでいる。", stageTargets("near", [319, 343, 365, 616], 1, 5), 35),
  object("near.indicator.right", "indicator", "右前柱の橙色表示灯は、上段と下段に分かれて配置される。", stageTargets("near", [1170, 343, 1217, 616], 1, 5), 35),
  object("near.rack.front.left", "rack", "左前方ラックは、二枚のシアン表示器と露出した基板を収める。", stageTargets("near", [385, 327, 501, 704], 1, 5), 25),
  object("near.rack.front.right", "rack", "右前方ラックには、橙色の灯と黒い機器箱が交互に並ぶ。", stageTargets("near", [1034, 327, 1152, 704], 1, 5), 25),
  object("near.rack.mid.left", "rack", "二本目の梁には、細身の左表示盤が垂直に固定されている。", stageTargets("near", [526, 382, 579, 636], 1, 5), 30),
  object("near.rack.mid.right", "rack", "右奥壁の小型計器列は、複数の暗い表示窓を縦に並べる。", stageTargets("near", [957, 382, 1010, 636], 1, 5), 30),
  object("near.cables.base.left", "cable", "左床際の太い黒ホースは、床面に沿って直角に曲がっている。", stageTargets("near", [255, 704, 423, 943], 1, 4), 16),
  object("near.cables.base.right", "cable", "右床際の配管は、青色の角形箱へつながっている。", stageTargets("near", [1113, 704, 1281, 943], 1, 4), 16),
  object("near.door", "door", "通路最奥の両開き扉は、左右対称のパネルで構成される。", stageTargets("near", [700, 449, 838, 579], 1, 5), 24),
  object("near.door.handles", "handle", "中央線を挟み、短い金属取っ手が左右一対で付いている。", stageTargets("near", [751, 498, 785, 550], 1, 5), 55),
  object("near.ceiling.tray", "ceiling-tray", "黒いケーブル溝が、中央天井の照明列を縦に分けている。", stageTargets("near", [607, 0, 930, 186], 1, 3), 8),

  object("deep.star-window.left", "star-window", "左観測窓では、大きな星点が白い窓枠の中央寄りに見える。", stageTargets("deep", [0, 166, 283, 687], 1, 3), 12),
  object("deep.star-window.right", "star-window", "右観測窓には、間隔の広い星点が暗い背景へ散っている。", stageTargets("deep", [1283, 166, 1536, 687], 1, 3), 12),
  object("deep.vent.left", "vent", "左柱には、丸穴の並ぶ板が三段に分かれて付いている。", stageTargets("deep", [244, 222, 307, 663], 1, 4), 30),
  object("deep.vent.right", "vent", "右柱には、細長い金属格子が縦向きに付いている。", stageTargets("deep", [1228, 222, 1290, 663], 1, 4), 30),
  object("deep.pipe.left", "pipe", "左壁の二本の黒い主管が、天井から床方向へ平行に通る。", stageTargets("deep", [317, 0, 379, 763], 1, 5), 18),
  object("deep.pipe.right", "pipe", "右壁の主管は、複数の金属継手を介して縦に延びる。", stageTargets("deep", [1156, 0, 1219, 763], 1, 5), 18),
  object("deep.rack.front.left", "rack", "左前方の縦長表示盤が、シアンの面を点灯している。", stageTargets("deep", [386, 251, 520, 790], 1, 5), 28),
  object("deep.rack.front.right", "rack", "右前方の箱には、青い表示面と黒い矩形部品が並ぶ。", stageTargets("deep", [1015, 251, 1151, 790], 1, 5), 28),
  object("deep.rack.mid.left", "rack", "左奥の小型表示盤は、細い支柱に沿って縦に固定されている。", stageTargets("deep", [540, 319, 606, 711], 1, 5), 35),
  object("deep.rack.mid.right", "rack", "右奥の計器棚では、配線と小型部品が前面に露出している。", stageTargets("deep", [929, 319, 997, 711], 1, 5), 35),
  object("deep.rack.far.left", "rack", "左最奥の細い表示器が、淡い青色で点灯している。", stageTargets("deep", [611, 391, 634, 651], 1, 5), 45),
  object("deep.rack.far.right", "rack", "右最奥の表示器は、扉脇の狭い壁面へ取り付けられている。", stageTargets("deep", [903, 391, 926, 651], 1, 5), 45),
  object("deep.boxes.base.left", "box", "左床際の角形箱には、低い位置に複数の丸い部品が並ぶ。", stageTargets("deep", [0, 706, 324, 1024], 1, 2), 15),
  object("deep.boxes.base.right", "box", "右床際の角形箱には、橙色の部品と黒い配線が見える。", stageTargets("deep", [1212, 706, 1536, 1024], 1, 2), 15),
  object("deep.door", "door", "奥の扉は、厚い中央シールと白い分割パネルで構成される。", stageTargets("deep", [646, 410, 889, 642], 1, 5), 25),
  object("deep.door.handles", "handle", "扉中央の二本の取っ手は、短い金属棒を平行に配置している。", stageTargets("deep", [753, 494, 782, 555], 1, 5), 55),
  object("deep.ceiling.tray", "ceiling-tray", "黒い天井溝が、白い照明器具の間を通路方向へ延びている。", stageTargets("deep", [610, 0, 920, 318], 1, 5), 8),

  object("boss.monitor", "monitor", "シアン一色の画面が、右壁の大型モニターに表示されている。", [target("boss", [1125, 282, 1406, 487], ["b000"])], 1),
  object("boss.brain-jelly", "jelly", "琥珀色の半透明ゼリーが、脳のような多房形状で吊られている。", [target("boss", { type: "multi-bbox", boxes: [
    [590, 94, 804, 202], [420, 202, 957, 321], [354, 321, 1006, 678]
  ] }, ["b000"])], 20),
  object("boss.suspension-ring", "rig", "白い多重リングが、天井の円形架台からゼリーを支持している。", [target("boss", [369, 0, 1042, 196], ["b000"])], 8),
  object("boss.suspension-cables", "cable", "黒い束線が、上部リングからゼリー表面へ垂れている。", [target("boss", [360, 83, 1005, 295], ["b000"])], 9),
  object("boss.larva", "larva", "白い環節を重ねた幼生が、床上で皿を抱えて座っている。", [target("boss", [876, 398, 1298, 912], ["b000"])], 30),
  object("boss.face", "face", "幼生の顔には、丸い目と大きく開いた口が並ぶ。", [target("boss", [932, 401, 1128, 573], ["b000"])], 45),
  object("boss.plate", "plate", "白い一枚皿に、琥珀色のゼリー片が盛られている。", [target("boss", [849, 552, 1134, 647], ["b000"])], 50),
  object("boss.spoon", "spoon", "金属製スプーンが、皿と幼生の口元の間へ伸びている。", [target("boss", [841, 489, 1030, 563], ["b000"])], 70),
  object("boss.portion", "portion", "皿上には、切り分けられた琥珀色のゼリー片が集められている。", [target("boss", [904, 536, 1059, 616], ["b000"])], 65),
  object("boss.mouth-strand", "strand", "幼生の口元から、半透明の琥珀色の細片が垂れている。", [target("boss", [991, 493, 1057, 573], ["b000"])], 75),
  object("boss.star-window.left", "window", "左の船窓から、暗い宇宙空間と星点が見える。", [target("boss", [0, 317, 186, 562], ["b000"])], 5),
  object("boss.console.left", "console", "左船窓の下に、青い表示器を備えた操作卓が張り出す。", [target("boss", [0, 506, 133, 632], ["b000"])], 10),
  object("boss.rack.left", "rack", "左壁の計器ラックには、配線と小型表示器が密集している。", [target("boss", [214, 356, 368, 665], ["b000"])], 10),
  object("boss.rack.right", "rack", "右壁の計器棚は、大型モニター下に複数の角形機器を積む。", [target("boss", [1187, 492, 1439, 710], ["b000"])], 10),
  object("boss.floor-hatch", "hatch", "円形の床ハッチが、吊り機構の真下に同心円状で組まれている。", [target("boss", [239, 724, 989, 963], ["b000"])], 7)
];

export const HOTSPOT_MANIFEST = deepFreeze({
  version: "micro-cell-contextual-hotspots-v1",
  coordinateSpace: { units: "source-pixels", origin: "top-left", width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
  objects
});

export function normalizeHotspotBox(bbox) {
  return {
    x: Number(bbox?.x), y: Number(bbox?.y), width: Number(bbox?.width), height: Number(bbox?.height)
  };
}

function validateBox(box, prefix, width, height, errors) {
  const value = normalizeHotspotBox(box);
  if (![value.x, value.y, value.width, value.height].every(Number.isFinite)) errors.push(`${prefix} is non-numeric`);
  if (value.width <= 0 || value.height <= 0) errors.push(`${prefix} has non-positive size`);
  if (value.x < 0 || value.y < 0 || value.x + value.width > width || value.y + value.height > height) errors.push(`${prefix} is out of bounds`);
}

export function validateHotspotManifest(manifest = HOTSPOT_MANIFEST, { validNodes = null, validOwners = null } = {}) {
  const errors = [];
  const seen = new Set();
  const width = Number(manifest?.coordinateSpace?.width);
  const height = Number(manifest?.coordinateSpace?.height);
  const entries = Array.isArray(manifest?.objects) ? manifest.objects : [];
  const nodes = validNodes ? new Set(validNodes) : null;
  const owners = validOwners ? new Set(validOwners) : null;
  if (manifest?.coordinateSpace?.units !== "source-pixels" || manifest?.coordinateSpace?.origin !== "top-left") errors.push("coordinate space must be top-left source-pixels");
  if (width !== SOURCE_WIDTH || height !== SOURCE_HEIGHT) errors.push("coordinate space must be 1536x1024");

  for (const [index, entry] of entries.entries()) {
    const prefix = `objects[${index}]`;
    if (typeof entry?.id !== "string" || !/^[a-z][a-z0-9.-]*$/.test(entry.id)) errors.push(`${prefix}.id is invalid`);
    if (seen.has(entry?.id)) errors.push(`${prefix}.id is duplicated`);
    seen.add(entry?.id);
    if (typeof entry?.name !== "string" || !entry.name.trim()) errors.push(`${prefix}.name is empty`);
    if (typeof entry?.observation !== "string" || !entry.observation.trim()) errors.push(`${prefix}.observation is empty`);
    if (!Array.isArray(entry?.targets) || entry.targets.length === 0) errors.push(`${prefix}.targets is empty`);
    for (const [targetIndex, item] of (entry?.targets || []).entries()) {
      const targetPrefix = `${prefix}.targets[${targetIndex}]`;
      if (typeof item?.owner !== "string" || (owners && !owners.has(item.owner))) errors.push(`${targetPrefix}.owner is invalid`);
      if (!Array.isArray(item?.nodes) || item.nodes.length === 0) errors.push(`${targetPrefix}.nodes is empty`);
      for (const node of item?.nodes || []) if (typeof node !== "string" || (nodes && !nodes.has(node))) errors.push(`${targetPrefix}.nodes contains invalid node ${node}`);
      if (!Array.isArray(item?.boxes) || item.boxes.length === 0) errors.push(`${targetPrefix}.boxes is empty`);
      for (const [boxIndex, box] of (item?.boxes || []).entries()) validateBox(box, `${targetPrefix}.boxes[${boxIndex}]`, width, height, errors);
    }
    if (entry?.priority != null && !Number.isFinite(Number(entry.priority))) errors.push(`${prefix}.priority is invalid`);
    if (/generated-raw|mobile-responsive-v1|corridor-1m-runtime-scene-only-v4/i.test(JSON.stringify(entry))) errors.push(`${prefix} references a forbidden asset`);
  }
  return deepFreeze({ valid: errors.length === 0, errors, count: entries.length, ids: entries.map(({ id }) => id), sourceWidth: width, sourceHeight: height, rawAssetReferences: errors.filter((error) => error.includes("forbidden asset")).length });
}
