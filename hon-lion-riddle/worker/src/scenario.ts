// Story source: the supplied game-mvp.md, section 4 (truth assessment).
// Later user instructions add the hospital and make the camera explanation optional.
export const CANONICAL_TRUTH = [
  '洋館は幻覚である。',
  'プレイヤーの視点は、病院で自分の耳の中を映しているカメラの映像である。',
  '耳に入り込んだ虫が、プレイヤー自身の脳を食べている。',
  '心地よく聞こえていた音は、その虫が自分の脳を食べる捕食音である。',
  '虫を焼く操作は、現実では耳かきによる除去に対応する。現実でレーザー治療をしている設定ではない。',
  '虫を除去すると音の一部が消え、全駆除すると咀嚼音が止まる。',
  '本ライオンは、正体が虫の会話相手ではない。',
];

export const SOLUTION_CRITERIA = {
  world: '洋館が幻覚であること。',
  threat: '耳に入り込んだ虫が、自分の脳を食べていること。',
  sound: '心地よく聞こえていた音は、その虫が自分の脳を食べる捕食音であること。',
} as const;

export const UNDECIDED = [
  '現実で耳かきを操作しているのは誰か。',
  '入口の向こうの声は誰か。',
  'なぜ耳を確認していたのか。',
];
