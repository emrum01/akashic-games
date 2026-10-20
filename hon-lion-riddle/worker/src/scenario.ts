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

// These are independent understanding checkpoints. They are intentionally separate
// from SOLUTION_CRITERIA: reaching them is feedback, never a solve condition.
// Keep this rubric server-side; only the stable cp1..cp5 IDs are public.
export const CHECKPOINT_CRITERIA = {
  cp1: 'プレイヤーが見ている洋館・光景は幻覚である。',
  cp2: '聞こえている音そのものは幻覚ではない。',
  cp3: 'その音の発生源はプレイヤーの身体の内側（耳の内側を含む）である。',
  cp4: '音を生み出している主体・出来事はプレイヤー自身ではない。自分の意思によらない身体音だけではこの理解を確認しない。',
  cp5: '音を生み出している特定の主体・出来事（音そのもの・音を聞くことではない）が認知機能の低下を引き起こしている。単に「音が原因」「音を聞くと悪化する」だけでは確認しない。',
} as const;

// Trusted scenario facts used only by the server-side ordinary-question judge.
// They are facts, not player-facing hints or progress instructions.
export const CHECKPOINT_FACTS = [
  'プレイヤーが見ている洋館・光景は幻覚だが、聞こえている音そのものは現実の音である。',
  'その音の発生源はプレイヤーの身体の内側（耳の内側を含む）にある。',
  '音を生み出している主体・出来事はプレイヤー自身ではない。',
  '音を生み出している特定の主体・出来事が認知機能の低下を引き起こしており、音を聞くこと自体が原因ではない。',
] as const;

export const UNDECIDED = [
  '現実で耳かきを操作しているのは誰か。',
  '入口の向こうの声は誰か。',
  'なぜ耳を確認していたのか。',
];
