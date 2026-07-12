(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const query = new URLSearchParams(location.search);
  const debugMode = query.get("debug") === "1";
  const analytics = window.AkashicAnalytics || { track: () => {} };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // 承認（＝息）判定パラメータ。実機調整のため ?debug=1 と併せて URL クエリで上書き可
  // （例: ?ratio=1.5&hold=140&peak=3）。「吹いたのに無反応」を避けるため感度優先。
  const readNum = (key, fallback) => {
    const value = parseFloat(query.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  const DETECT = {
    ratio: readNum("ratio", 1.6),        // 「反応中」フィードバックを出す下限（環境音比）
    strongRatio: readNum("strong", 3.0), // これを超えて初めて広告を実際に押す（強い息）
    strongHoldMs: readNum("shold", 120), // 強い息の必要持続時間（一瞬のピークでは動かさない）
    peakRatio: readNum("peak", 3.2),
    holdMs: readNum("hold", 150),
    absFloor: readNum("floor", 0.006),
    flatMin: readNum("flat", 0.10),
    zcrMin: readNum("zcr", 0.05),
    clipMax: readNum("clip", 0.08),
    levelSpanDb: readNum("span", 22)
  };

  // 見た目は現代の胡散臭いWeb広告フォーマットのまま（記事広告/偽警告/当選ポップアップ等）、
  // 中身は「30年後の未来技術の誇大広告」。未来のマーケ業者が時間通信で過去の顧客へ未来の製品を売る
  // ビジネス（背景設定。ゲーム内では説明しない。詳細は README の設計意図）。請求は「未来の自分」に
  // 行く匂わせ（※後払い/将来請求）を数枚に控えめに仕込み、背景を滲ませる。
  // t=ラベル / b=本文(見出し) / s=サイズ(lg/md/sm) / v=様式 / img=画像(ads/配下) / go=偽ボタン文言。
  //  v: article=おすすめ記事風(サムネ+釣り見出し) / image=写真広告(codex生成写真) /
  //     popup=偽OS当選ポップアップ / warning=偽ウイルス警告 / cookie=Cookie同意バナー /
  //     download=緑ダウンロードボタン / banner=黄色い煽り帯。写真広告は先頭に集中（前面）。
  // 各広告の d = クリック（短いタップ）で開く「未来のサービス詳細」オーバーレイの中身。
  // 2010年代の悪質LP × 未来SFの融合。誇大なサービス説明＋「支払いは30年後の自分」という対価UI。
  // 世界律「未来からの介入は必ず対価を取る」に一致。操作ヒント・答えは書かない（世界観の読み物）。
  // d の各フィールド: code=識別子 / name=サービス名 / lead=釣りコピー / body=誇大な説明文（段落配列）/
  //   img=詳細で大きく見せる画像（省略時は ad.img）/ now*=今のあなたの料金 / future*=30年後のあなたの料金 /
  //   terms=怖い注記（利息・自動更新・解約不能等）/ total=合計請求額（カウントアップ表示）/ fine=請求先の言い回し。
  const ADS = [
    { t: "広告", b: "10秒で体重20kg削減 医師も驚愕の新施術", s: "lg", v: "image", img: "adphoto-belly.jpg",
      d: { code: "SLIM-RELAY", name: "即時脂肪転送 SLIM-RELAY",
        lead: "たった10秒。あなたの脂肪20kgを、いまこの瞬間に消し去ります。",
        body: ["最新の時間転送技術が、あなたの余分な脂肪を30年後のあなたへ丸ごと送信。運動も食事制限も一切不要、施術台に横たわるだけで理想の身体が手に入ります。",
          "受け取った脂肪は未来のあなたが確実に保管。あなたは今日、鏡の前で歓声をあげるだけでよいのです。"],
        nowLabel: "今のあなた", nowPrice: "¥0（施術当日）",
        futureLabel: "30年後のあなた", futurePrice: "¥8,800,000（一括・転送手数料込）",
        terms: ["転送された脂肪20kgは30年後のあなたへ全量返送されます（受取拒否不可）。", "施術後の解約・返金はできません。"],
        totalLabel: "合計請求額（確定）", total: 8800000,
        fine: "請求先: 契約者本人（脂肪受領時点の人格）。" } },
    { t: "PR", b: "飲むだけで全細胞が20歳若返る（話題）", s: "lg", v: "image", img: "adphoto-food.jpg",
      d: { code: "CELL-20", name: "全細胞リバース CELL-20",
        lead: "一口飲むだけ。全身37兆個の細胞が、20歳の状態へ巻き戻ります。",
        body: ["未来の再生医療をボトル一本に凝縮。飲んだ瞬間から肌・臓器・骨密度が若い頃へ逆行し、鏡の中のあなたは20年前に戻ります。",
          "効果は永続。ただし細胞の「時間」は貸与制であり、巻き戻した年月ぶんの利息が発生します。"],
        nowLabel: "今のあなた", nowPrice: "¥0（初回一本）",
        futureLabel: "30年後のあなた", futurePrice: "¥14,600,000（複利・自動更新）",
        terms: ["巻き戻した20年ぶんの「時間」は貸与です。返却期限は寿命。", "複利で加算され、自動更新は停止できません。"],
        totalLabel: "合計請求額（複利込）", total: 14600000,
        fine: "請求先: 契約者本人（若返り効果を享受した人格）。" } },
    { t: "スポンサード", b: "医師が警告『その不調、旧型の脳OSが原因』", s: "md", v: "article", img: "adphoto-doctor.jpg",
      d: { code: "NEURO-DIAG", name: "神経OS診断 NEURO-DIAG",
        lead: "その頭痛、その物忘れ――原因はあなたの「旧型の脳OS」かもしれません。",
        body: ["専門医監修のスキャンが、あなたの神経OSのバージョンを即時判定。「更新されていない脳」が引き起こす不調のリスクを、未来の統計から算出してお知らせします。",
          "診断結果は無料で表示されますが、結果の「保管」と「今後の照会」に対して継続課金が発生します。"],
        nowLabel: "今のあなた", nowPrice: "¥0（診断表示）",
        futureLabel: "30年後のあなた", futurePrice: "¥3,980,000（結果保管料・累計）",
        terms: ["診断結果はあなたの神経に刻まれ、削除できません。", "「知ってしまった」時点で保管契約が成立します。"],
        totalLabel: "合計請求額（保管料）", total: 3980000,
        fine: "請求先: 契約者本人（診断結果を認知した人格）。" } },
    { t: "広告", b: "未来送金で不労所得 月300万（後払い・30年後）", s: "lg", v: "image", img: "adphoto-cash.jpg",
      d: { code: "FUTURE-REMIT", name: "未来送金 FUTURE-REMIT",
        lead: "働かずに毎月300万円。未来のあなたが、今のあなたへ仕送りします。",
        body: ["30年後の裕福なあなたから、現在のあなたの口座へ毎月300万円が自動入金。今日から仕事を辞め、好きなことだけをして暮らせます。",
          "受け取った総額は、時効を迎えた「未来の元本」に時間利息を上乗せして、30年後のあなたが一括返済します。"],
        nowLabel: "今のあなた（受取）", nowPrice: "＋¥3,000,000／月",
        futureLabel: "30年後のあなた（返済）", futurePrice: "¥360,000,000（元本＋時間利息）",
        terms: ["受取総額には時間利息が付き、元本の数倍に膨らみます。", "返済者を現在のあなたが選ぶことはできません（必ず本人）。"],
        totalLabel: "合計返済額（確定）", total: 360000000,
        fine: "請求先: 契約者本人（仕送りを費消した人格）。" } },
    { t: "PR", b: "嫌な記憶、消せます（施術は返金不可）", s: "md", v: "article", img: "adphoto-supplement.jpg",
      d: { code: "ERASE-MEM", name: "記憶除去 ERASE-MEM",
        lead: "忘れたいあの記憶を、一件まるごと抜き取ります。",
        body: ["思い出したくない記憶を指定するだけ。未来の神経外科が、その一件を根こそぎ抽出し、あなたの意識から永久に消去します。",
          "抜き取られた記憶は破棄されず、未来のあなたの元へ保管されます。いつか請求のために、まとめて返却されます。"],
        nowLabel: "今のあなた", nowPrice: "¥0（一件目）",
        futureLabel: "30年後のあなた", futurePrice: "¥6,600,000／件",
        terms: ["消した記憶は施術直後に忘れるため、契約内容も忘れます。", "返金不可。消去の取り消し（記憶の再生）は有料です。"],
        totalLabel: "合計請求額（一件あたり）", total: 6600000,
        fine: "請求先: 契約者本人（記憶を返却された時点の人格）。" } },
    { t: "広告", b: "あなたの脳OS、更新されていません", s: "md", v: "image", img: "adphoto-phone.jpg",
      d: { code: "CORTEX-UPDATE", name: "脳OS更新 CORTEX-UPDATE",
        lead: "あなたの思考は、30年前の古いOSで動いています。今すぐ更新を。",
        body: ["旧型の脳OSは処理が遅く、判断を誤りやすいことが未来の研究で判明。最新版へ更新すれば、記憶・直感・意思決定のすべてが最適化されます。",
          "更新は月額サブスクリプション制。最新の思考を維持するため、支払いを止めると旧OSへ強制ロールバックされます。"],
        nowLabel: "今のあなた", nowPrice: "¥0（初回更新）",
        futureLabel: "30年後のあなた", futurePrice: "¥5,200,000／月（自動更新・解約不能）",
        terms: ["解約すると更新後に得た記憶・判断力がすべて失われます。", "自動更新は本人の意思では停止できません。"],
        totalLabel: "合計請求額（累計・30年）", total: 1872000000,
        fine: "請求先: 契約者本人（最新OSで思考している人格）。" } },
    { t: "スポンサード", b: "亡くなった方と、また話せます 1分99円〜", s: "md", v: "image", img: "adphoto-face.jpg",
      d: { code: "ECHO-LINE", name: "残響回線 ECHO-LINE",
        lead: "もう会えないあの人と、もう一度だけ話せます。1分99円から。",
        body: ["故人の残した言葉・声・癖から人格を再構成し、時間回線ごしに会話を再現。「ありがとう」も「ごめんね」も、今夜もう一度伝えられます。",
          "会話は従量課金。話せば話すほど、あなたは回線を切れなくなり――請求は静かに積み上がっていきます。"],
        nowLabel: "今のあなた", nowPrice: "¥99／分",
        futureLabel: "30年後のあなた", futurePrice: "従量請求 累計 ¥14,256,000",
        terms: ["再構成された人格は本物ではありませんが、区別はつきません。", "回線を切る決断ができるのは、あなただけです。"],
        totalLabel: "合計請求額（通話累計）", total: 14256000,
        fine: "請求先: 契約者本人（別れを先延ばしにした人格）。" } },
    { t: "PR", b: "住宅ローン、30年後のあなたが完済済み", s: "md", v: "article", img: "adphoto-house.jpg",
      d: { code: "LOAN-SHIFT", name: "時間肩代わり LOAN-SHIFT",
        lead: "あなたの住宅ローン、30年後のあなたが「もう払い終えて」います。",
        body: ["残債を未来へスライド。今日から返済はゼロになり、あなたの家はすでに完済済みという扱いになります。夢のマイホームが、今すぐ本当にあなたのものに。",
          "肩代わりした残債には「時間経過分」の割増が加わり、30年後のあなたが二重に返済します。"],
        nowLabel: "今のあなた", nowPrice: "¥0（残債スライド）",
        futureLabel: "30年後のあなた", futurePrice: "¥48,000,000（残債＋時間割増）",
        terms: ["肩代わり後、現在のあなたはローンの存在を意識できなくなります。", "割増率は未来の金利に連動し、上限はありません。"],
        totalLabel: "合計返済額（時間割増込）", total: 48000000,
        fine: "請求先: 契約者本人（完済済みの家に住んだ人格）。" } },
    { t: "広告", b: "食べても太らない身体、購入できます", s: "md", v: "image", img: "adphoto-meal.jpg",
      d: { code: "META-BUY", name: "代謝改変 META-BUY",
        lead: "何をどれだけ食べても太らない身体を、そのまま購入できます。",
        body: ["未来の代謝設計により、摂取カロリーを体外へ自動排出する体質へ改変。ケーキもラーメンも我慢なし、それでいて体型は一切変わりません。",
          "改変された代謝は「レンタル」です。契約が満了すると、蓄積されるはずだったカロリーが一括で身体へ戻ります。"],
        nowLabel: "今のあなた", nowPrice: "¥0（体質改変）",
        futureLabel: "30年後のあなた", futurePrice: "¥9,900,000（改変維持費・累計）",
        terms: ["契約満了時、30年ぶんのカロリーが一度に反映されます。", "体質のレンタルであり、あなたの所有物にはなりません。"],
        totalLabel: "合計請求額（維持費）", total: 9900000,
        fine: "請求先: 契約者本人（好きなだけ食べた人格）。" } },
    { t: "PR", b: "寿命+15年プラン モニター残り3名", s: "sm", v: "article", img: "adphoto-supplement.jpg",
      d: { code: "LIFE-15", name: "延命プラン LIFE+15",
        lead: "あなたの寿命に、確実な15年を追加します。モニター残り3名。",
        body: ["未来の生命維持プロトコルが、あなたの寿命を15年きっかり延長。まだ見ぬ景色を、大切な人との時間を、15年ぶん多く手にできます。",
          "延長された15年は前借りです。生きたぶんだけ、30年後のあなたの口座から日割りで引き落とされます。"],
        nowLabel: "今のあなた", nowPrice: "¥0（モニター価格）",
        futureLabel: "30年後のあなた", futurePrice: "¥33,000,000（延命15年ぶん）",
        terms: ["延命した時間は前借りであり、途中解約すると即時満了します。", "残り3名の表示は常に「残り3名」です。"],
        totalLabel: "合計請求額（延命ぶん）", total: 33000000,
        fine: "請求先: 契約者本人（延びた15年を生きた人格）。" } },
    { t: "広告", b: "この人、実は既に他界しています（続きを読む）", s: "md", v: "image", img: "adphoto-face.jpg",
      d: { code: "OBIT-QUERY", name: "訃報照会 OBIT-QUERY",
        lead: "あなたが今見ているこの人は、未来ではもう亡くなっています。",
        body: ["未来の戸籍データベースと照合し、知人・有名人・そしてあなた自身の「その後」を照会。誰がいつ、どうなるのか――続きは会員限定で開示します。",
          "照会した「未来の死」は、知ってしまった時点で心に居座り続けます。その重さに対して、閲覧料が発生します。"],
        nowLabel: "今のあなた", nowPrice: "¥0（一件目の閲覧）",
        futureLabel: "30年後のあなた", futurePrice: "¥1,200,000（閲覧履歴・累計）",
        terms: ["照会した未来は変更できません。知るだけです。", "閲覧履歴は消去できず、料金の対象になり続けます。"],
        totalLabel: "合計請求額（閲覧料）", total: 1200000,
        fine: "請求先: 契約者本人（他人の未来を覗いた人格）。" } },
    { t: "スポンサード", b: "税金、未来から前借りできる裏ワザ5選", s: "sm", v: "article", img: "adphoto-cash.jpg",
      d: { code: "TAX-ADVANCE", name: "税前借り TAX-ADVANCE",
        lead: "今年の税金、30年後のあなたに払わせる裏ワザ。",
        body: ["納税義務を未来へ繰り延べ。今年の重い税負担がゼロになり、手取りが一気に増えます。合法グレーの時間差スキームを、専門家が5つご提案。",
          "繰り延べた税額には延滞に相当する「時間加算税」が付き、30年後のあなたがまとめて精算します。"],
        nowLabel: "今のあなた", nowPrice: "¥0（今年の納税）",
        futureLabel: "30年後のあなた", futurePrice: "¥22,400,000（税額＋時間加算税）",
        terms: ["管轄が時代を跨ぐため、取り締まりは実質的に困難です。", "時間加算税は年々増え続けます。"],
        totalLabel: "合計精算額（加算税込）", total: 22400000,
        fine: "請求先: 契約者本人（納税を先送りした人格）。" } },
    { t: "お知らせ", b: "おめでとうございます！寿命+15年に当選しました", s: "md", v: "popup", go: "受け取る",
      d: { code: "WIN-LIFE15", name: "【当選】寿命+15年 プレゼント",
        lead: "おめでとうございます！あなたは寿命+15年の当選者に選ばれました！",
        body: ["面倒な手続きは不要。「受け取る」を押すだけで、あなたの寿命に15年が今すぐ加算されます。当選はあなただけの特別なチャンスです。",
          "※本当選は「受け取り」をもって有償契約となります。無料なのは当選通知のみで、延長された寿命ぶんは後日ご請求いたします。"],
        img: "adphoto-supplement.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（当選・受取）",
        futureLabel: "30年後のあなた", futurePrice: "¥33,000,000（延命15年ぶん）",
        terms: ["「当選」なのは通知だけで、延命そのものは有料です。", "受け取った時点で契約が成立し、辞退はできません。"],
        totalLabel: "合計請求額（当選特典ぶん）", total: 33000000,
        fine: "請求先: 契約者本人（当選を受け取った人格）。" } },
    { t: "警告", b: "旧型の脳OSが検出されました", s: "md", v: "warning", go: "今すぐ更新",
      d: { code: "OS-ALERT", name: "【警告】旧型脳OS 緊急修復",
        lead: "危険：あなたの脳OSは旧型です。判断力の低下が検出されました。",
        body: ["このまま放置すると、誤った選択・記憶の欠落・人格の劣化が進行する恐れがあります。今すぐ緊急修復を実行し、あなたの思考を保護してください。",
          "※「今すぐ更新」を押すと緊急修復パッチが適用され、修復費用が発生します。警告表示は無料です。"],
        img: "adphoto-phone.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（緊急スキャン）",
        futureLabel: "30年後のあなた", futurePrice: "¥4,400,000（緊急修復パッチ）",
        terms: ["「検出された不調」は修復して初めて実在を確認できます。", "修復パッチは一度適用すると除去できません。"],
        totalLabel: "合計請求額（修復費）", total: 4400000,
        fine: "請求先: 契約者本人（警告に従った人格）。" } },
    { t: "無料", b: "脳OSアップデータ 今なら初月無料", s: "md", v: "download", go: "ダウンロード",
      d: { code: "CORTEX-DL", name: "CORTEX アップデータ",
        lead: "脳OSを最新に保つ常駐アップデータ。今なら初月無料でお試し。",
        body: ["ダウンロードするだけで、あなたの神経に常駐し、思考のバグを自動修正。最新の判断力を24時間キープします。初月は完全無料でお試しいただけます。",
          "初月以降は自動で有料プランへ移行。アンインストールには、常駐先である「あなたの神経」からの物理的な除去が必要になります。"],
        img: "adphoto-phone.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（初月無料）",
        futureLabel: "30年後のあなた", futurePrice: "¥5,200,000／月（初月経過後）",
        terms: ["初月終了後に自動で有料化します（通知はありません）。", "アンインストールは神経からの除去手術を要します。"],
        totalLabel: "合計請求額（1年ぶん）", total: 62400000,
        fine: "請求先: 契約者本人（アップデータを常駐させた人格）。" } },
    { t: "", b: "本サイトは未来Cookieを使用します（課金は30年後）", s: "md", v: "cookie", go: "同意する",
      d: { code: "FUTURE-COOKIE", name: "未来Cookie 利用同意",
        lead: "本サイトは、あなたの未来を追跡する「未来Cookie」を使用します。",
        body: ["未来Cookieは、あなたの30年後までの行動・購買・健康状態を先回りで記録し、最適な広告を今日のあなたへ届けます。「同意する」で快適な体験を。",
          "同意すると、未来のあなたの情報が広告主へ継続提供され、その対価が発生します。拒否ボタンは、ありません。"],
        img: "adphoto-cash.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（同意）",
        futureLabel: "30年後のあなた", futurePrice: "¥990,000／年（データ提供料・累計 ¥29,700,000）",
        terms: ["「同意する」以外の選択肢は用意されていません。", "未来Cookieは端末を替えても、あなたに追従します。"],
        totalLabel: "合計請求額（データ提供・累計）", total: 29700000,
        fine: "請求先: 契約者本人（同意を押した人格）。" } },
    { t: "広告", b: "貼るだけで若返り 個人差ありません", s: "sm", v: "banner",
      d: { code: "REVERSE-PATCH", name: "若返りパッチ REVERSE-PATCH",
        lead: "肌に貼るだけ。個人差なく、誰でも確実に若返ります。",
        body: ["未来の経皮ナノ技術を一枚のパッチに。貼った箇所から時間が逆行し、シワもシミも数日で消えていきます。効果に個人差はありません、絶対です。",
          "パッチが巻き戻した時間は貸与制。剥がしても時間の貸し借りは続き、利用日数ぶんが未来のあなたに請求されます。"],
        img: "adphoto-supplement.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（お試し1枚）",
        futureLabel: "30年後のあなた", futurePrice: "¥3,300,000（時間貸与料・累計）",
        terms: ["「個人差ありません」＝誰も逃れられない、という意味です。", "剥がしても契約は継続します。"],
        totalLabel: "合計請求額（貸与料）", total: 3300000,
        fine: "請求先: 契約者本人（若い肌で過ごした人格）。" } },
    { t: "当選", b: "記憶容量プランを1名様に無料付与", s: "sm", v: "popup", go: "今すぐ受取",
      d: { code: "MEM-CAP", name: "記憶容量プラン MEM-CAP",
        lead: "あなた1名様に、無制限の記憶容量を無料付与します。",
        body: ["人生の全瞬間を、劣化なしで永久保存。忘れたくない景色も、大切な人の声も、一切失わずに抱えていられます。今なら容量無制限を無料で開放。",
          "保存された記憶はクラウドに常駐します。容量は無料ですが、記憶を「引き出す」たびに従量課金が発生します。"],
        img: "adphoto-phone.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（容量付与）",
        futureLabel: "30年後のあなた", futurePrice: "¥7,700,000（記憶引き出し料・累計）",
        terms: ["容量は無料ですが、思い出すたびに課金されます。", "支払いを止めると、預けた記憶にアクセスできなくなります。"],
        totalLabel: "合計請求額（引き出し料）", total: 7700000,
        fine: "請求先: 契約者本人（記憶を引き出した人格）。" } },
    { t: "SYSTEM", b: "あなたの細胞の更新期限が切れています", s: "sm", v: "warning", go: "修復する",
      d: { code: "CELL-RENEW", name: "細胞更新 CELL-RENEW",
        lead: "システム警告：あなたの細胞の更新期限が切れています。",
        body: ["細胞の「更新ライセンス」が失効すると、老化が加速し、修復不能な劣化が始まります。手遅れになる前に、今すぐライセンスを更新してください。",
          "※「修復する」で細胞更新ライセンスが再発行され、費用が発生します。期限切れの通知自体は無料です。"],
        img: "adphoto-food.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（期限確認）",
        futureLabel: "30年後のあなた", futurePrice: "¥5,500,000（ライセンス再発行）",
        terms: ["「期限」は更新して初めて実在を確認できます。", "一度更新すると、以後は永続的に更新義務が生じます。"],
        totalLabel: "合計請求額（ライセンス）", total: 5500000,
        fine: "請求先: 契約者本人（細胞を更新した人格）。" } },
    { t: "お得", b: "残り3分 若返り初回無料（後払い・30年後）", s: "sm", v: "download", go: "受け取る",
      d: { code: "YOUNG-TRIAL", name: "若返り 初回無料トライアル",
        lead: "残り3分！若返り施術の初回が、今だけ無料。支払いは30年後。",
        body: ["締切間近の特別枠。若返り施術の初回を無料でお試しいただけます。効果を実感したら、そのまま継続。支払いはすべて30年後のあなたにお任せください。",
          "「初回無料」の翌回から自動で有料継続に移行します。若返った身体に慣れたあなたは、もう後戻りできません。"],
        img: "adphoto-food.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（初回無料）",
        futureLabel: "30年後のあなた", futurePrice: "¥4,900,000（2回目以降・自動継続）",
        terms: ["カウントダウンは何度読み込んでも「残り3分」です。", "初回後の自動継続は本人の意思で止められません。"],
        totalLabel: "合計請求額（継続ぶん）", total: 4900000,
        fine: "請求先: 契約者本人（若返りに慣れた人格）。" } },
    { t: "広告", b: "審査なし 未来からの前借り融資 ※返済は将来のあなた", s: "sm", v: "banner",
      d: { code: "PRELOAN", name: "前借り融資 PRELOAN",
        lead: "審査なし・即日融資。返すのは、30年後のあなたです。",
        body: ["ブラックでも無職でも関係なし。未来のあなたの信用を担保に、今すぐ現金をお貸しします。返済は30年後、あなた自身が行うので取りっぱぐれなし。",
          "借りた瞬間から時間利息が発生し、元本の数十倍に膨張します。返済者はあなた本人に固定され、変更できません。"],
        img: "adphoto-cash.jpg",
        nowLabel: "今のあなた（融資）", nowPrice: "＋¥500,000（即日）",
        futureLabel: "30年後のあなた（返済）", futurePrice: "¥45,000,000（元本＋時間利息）",
        terms: ["時間利息は元本の数十倍まで膨らみます。", "返済者は必ず本人。逃げ道はありません。"],
        totalLabel: "合計返済額（時間利息込）", total: 45000000,
        fine: "請求先: 契約者本人（前借りを使い切った人格）。" } },
    { t: "占", b: "未来予知 的中率120%（実測済み）初回無料", s: "sm", v: "banner",
      d: { code: "ORACLE", name: "未来予知 ORACLE",
        lead: "的中率120%。あなたの未来を、実測データで言い当てます。",
        body: ["占いではありません。実際の未来を観測して持ち帰る「予知」です。恋愛も仕事も健康も、起こる出来事を先に知ってから今日を選べます。",
          "初回は無料。しかし一度「自分の未来」を知ったあなたは、次が気になってやめられなくなります。以降は一件ごとに課金。"],
        img: "adphoto-face.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（初回予知）",
        futureLabel: "30年後のあなた", futurePrice: "¥2,900,000（予知照会・累計）",
        terms: ["的中率120%＝予知が未来を確定させる、という意味です。", "知った未来は、避けようとしても訪れます。"],
        totalLabel: "合計請求額（照会累計）", total: 2900000,
        fine: "請求先: 契約者本人（自分の未来を覗いた人格）。" } },
    { t: "警告", b: "脳内に5件の未処理エラー", s: "sm", v: "warning", go: "今すぐ修復",
      d: { code: "BRAIN-ERR", name: "【警告】脳内エラー 5件検出",
        lead: "危険：あなたの脳内に、未処理のエラーが5件検出されました。",
        body: ["放置されたエラーは、判断ミス・記憶の混乱・感情の暴走を引き起こす可能性があります。5件すべてを今すぐ修復し、あなたの脳を正常化してください。",
          "※「今すぐ修復」で5件の修復処理が実行され、一件ごとに費用が発生します。エラー件数の表示は無料です。"],
        img: "adphoto-doctor.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（診断）",
        futureLabel: "30年後のあなた", futurePrice: "¥1,200,000 × 5件 ＝ ¥6,000,000",
        terms: ["エラーは修復を実行して初めて存在が確定します。", "一件でも修復すると、残り4件も自動で処理されます。"],
        totalLabel: "合計請求額（5件ぶん）", total: 6000000,
        fine: "請求先: 契約者本人（エラーを修復した人格）。" } },
    { t: "限定", b: "タイムマシン往復 本日限定・残り3名", s: "sm", v: "banner",
      d: { code: "TIME-TRIP", name: "往復チケット TIME-TRIP",
        lead: "過去へ、未来へ。時間の往復チケット、本日限定・残り3名。",
        body: ["行きたい時代を選ぶだけ。あの日のやり直しも、未来の下見も自由自在。片道ではなく往復なので、いつでも「今」へ戻ってこられます。",
          "帰りの便には「時間燃料費」がかかります。前払いは今のあなた¥0、精算は帰着後――つまり30年後のあなたです。"],
        img: "adimg-gadget.jpg",
        nowLabel: "今のあなた", nowPrice: "¥0（搭乗）",
        futureLabel: "30年後のあなた", futurePrice: "¥88,000,000（往復時間燃料費）",
        terms: ["「残り3名」は本日限定ですが、毎日が本日です。", "帰着しない場合、燃料費は増え続けます。"],
        totalLabel: "合計請求額（燃料費）", total: 88000000,
        fine: "請求先: 契約者本人（現在へ帰着した人格）。" } }
  ];

  // アニメーション抑制設定を尊重（タイピング/点滅を省略する）。
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ダウンロード演出で1文字ずつ表示する同意書の本文。
  const DL_BODY = "対象：あなた本人。\n未来のあなたが、脳への処置を要求しています……\n本人の同意なく処置は実行できません。同意の期限は、本日中。";

  // ヒント（クリックで開く2段階の後出し。氾濫の中の1個のダイアログから開く）。
  // 遠回しの示唆に留める（操作の直書き禁止）。「未来はWebを物理干渉できる」「この回線は風を通す」程度。
  const HINTS = [
    "未来は、Webを物理的に操作できるらしい。……この回線は、そのための細い通り道のようだ。",
    "回線は“風”を通す。強い空気の流れに、めっぽう弱いらしい。"
  ];

  const elements = {
    app: $("#app"),
    title: $("#title-screen"),
    game: $("#game-screen"),
    clear: $("#clear-screen"),
    start: $("#start-button"),
    restart: $("#restart-button"),
    phaseLabel: $("#phase-label"),
    noticeCount: $("#notice-count"),
    recordStage: $("#record-stage"),
    recordDocument: $("#record-document"),
    recordState: $("#record-state"),
    recordDeadline: $("#record-deadline"),
    recordNote: $("#record-note"),
    dialogField: $("#dialog-field"),
    pressure: $("#pressure-wave"),
    consoleKicker: $("#console-kicker"),
    consoleTitle: $("#console-title"),
    recordGuidance: $("#record-guidance"),
    contact: $("#contact-button"),
    consent: $("#consent-button"),
    alert: $("#alert-banner"),
    alertText: $("#alert-text"),
    alertAck: $("#alert-ack"),
    hintOverlay: $("#hint-overlay"),
    hintLabel: $("#hint-label"),
    hintText: $("#hint-text"),
    hintNext: $("#hint-next"),
    hintClose: $("#hint-close"),
    adDetail: $("#ad-detail-overlay"),
    adDetailCard: $("#ad-detail-card"),
    adDetailBody: $("#ad-detail-body"),
    adDetailClose: $("#ad-detail-close"),
    micIndicator: $("#mic-indicator"),
    micMeter: $("#mic-meter"),
    micGate: $("#mic-gate"),
    micGateAllow: $("#mic-gate-allow"),
    micGateCard: $("#mic-gate .manager-card"),
    manager: $("#manager-overlay"),
    managerText: $("#manager-text"),
    managerAck: $("#manager-ack"),
    managerCard: $("#manager-overlay .manager-card"),
    response: $("#response-panel"),
    responseLabel: $("#response-label"),
    responseText: $("#response-text"),
    responseClose: $("#response-close"),
    fallback: $("#fallback-panel"),
    enableManual: $("#enable-manual-button"),
    clearDetail: $("#clear-detail"),
    clearScold: $("#clear-scold"),
    lpLink: $("#lp-link"),
    share: $("#share-button"),
    debug: $("#debug-panel")
  };

  // モバイル判定はモジュールスコープで保持し、resize/orientationchange で更新する。
  let mobile = window.innerWidth <= 760;

  const state = {
    phase: "title",
    startedAt: 0,
    removed: 0,
    closeAttempts: 0,
    failures: 0,
    phaseFailures: 0,
    manualUnlocked: false,
    micReady: false,
    micDenied: false,
    firstBlowFired: false,
    rmsWindow: [],
    lastRecalib: 0,
    alertShown: false,
    hintStage: 0,
    hintDialogEl: null,
    noiseDb: -58,
    baselineRms: 0.004,
    peak01: 0,
    openingAudio: false,
    audio: null,
    trackSettings: null,
    pointerActive: false,
    keyActive: false,
    listening: false,
    detectedThisHold: false,
    candidateSince: 0,
    cooldownUntil: 0,
    rafId: 0,
    adDetailRaf: 0,
    hintTimer: 0,
    clearTimer: 0,
    typeTimer: 0,
    floodTimers: [],
    seqTimers: [],
    features: null,
    // 実時間物理: 強い息のときだけ広告を押す。currentLevel は常時のフィードバック、
    // pushLevel は「強い息」判定を通ったときのみ非0（押し出し力に使う）。
    currentLevel: 0,
    pushLevel: 0,
    strongSince: 0,
    peakThisHold: 0,
    adPhysics: new Map(),
    // 開いた未来サービス詳細で「契約／購入」した広告を記録する。
    // key=広告コード（重複購入は1回に集約）/ value={ name, amount }。クリア後の叱責演出で列挙する。
    purchases: new Map(),
    physicsRunning: false,
    physicsRaf: 0,
    lastPhysicsTs: 0,
    fieldW: 1,
    fieldH: 1
  };

  function clearTimers() {
    clearTimeout(state.hintTimer);
    clearTimeout(state.clearTimer);
    clearInterval(state.typeTimer);
    state.floodTimers.forEach((id) => clearTimeout(id));
    state.floodTimers = [];
    state.seqTimers.forEach((id) => clearTimeout(id));
    state.seqTimers = [];
  }

  function startGame() {
    releaseMic();
    clearTimers();
    Object.assign(state, {
      phase: "intro",
      startedAt: performance.now(),
      removed: 0,
      closeAttempts: 0,
      failures: 0,
      phaseFailures: 0,
      manualUnlocked: false,
      micReady: false,
      micDenied: false,
      firstBlowFired: false,
      rmsWindow: [],
      lastRecalib: 0,
      alertShown: false,
      hintStage: 0,
      hintDialogEl: null,
      noiseDb: -58,
      baselineRms: 0.004,
      peak01: 0,
      pointerActive: false,
      keyActive: false,
      listening: false,
      detectedThisHold: false,
      candidateSince: 0
    });

    elements.app.dataset.phase = "download";
    elements.title.hidden = true;
    elements.clear.hidden = true;
    elements.game.hidden = false;
    stopPhysics();
    state.adPhysics.clear();
    state.purchases.clear();
    if (elements.clearScold) {
      elements.clearScold.hidden = true;
      elements.clearScold.replaceChildren();
    }
    state.currentLevel = 0;
    elements.dialogField.replaceChildren();
    elements.micIndicator.hidden = true;
    elements.micIndicator.classList.remove("detecting");
    elements.micGate.hidden = true;
    elements.fallback.hidden = true;
    elements.contact.hidden = true;
    elements.consent.hidden = true;
    elements.alert.hidden = true;
    elements.alertAck.disabled = true;
    elements.hintOverlay.hidden = true;
    closeAdDetail();
    hideManager();
    hideResponse();

    elements.recordDocument.classList.remove("dimmed", "revealed");
    elements.recordState.textContent = "未署名";
    elements.recordDeadline.textContent = "本日中";

    setHeader("受信中", "広告 0件");
    analytics.track("game_start");
    showMicGate();
  }

  // 冒頭のマイク許可ゲート。何に使うかは明かさず（伏線）、ユーザージェスチャで getUserMedia を取る
  // （iOS の許可要件もここで満たす）。許可/拒否どちらでも同意書ダウンロードへ進む。
  function showMicGate() {
    state.phase = "micgate";
    elements.app.dataset.phase = "micgate";
    elements.micGate.hidden = false;
    elements.micGateAllow.disabled = false;
    elements.micGateCard.focus?.();
    analytics.track("mic_prompt_shown");
  }

  async function acceptMicGate() {
    if (state.phase !== "micgate") return;
    elements.micGateAllow.disabled = true;
    elements.micGateAllow.textContent = "回線を開いています…";
    await requestMicAccess();
    elements.micGate.hidden = true;
    startDownloadSequence();
  }

  // getUserMedia を取得し、環境音ベースラインを測って常時リスニングを開始する。
  async function requestMicAccess() {
    try {
      await openAudio();
      await calibrateBaseline(700);
      state.micReady = true;
      state.micDenied = false;
      elements.micIndicator.hidden = false;
      micInUse(true);
      startContinuousListen();
      analytics.track("mic_granted");
    } catch (error) {
      console.warn("Microphone unavailable:", error?.name || error);
      await releaseMic();
      state.micReady = false;
      state.micDenied = true;
      elements.micIndicator.hidden = true;
      analytics.track("mic_denied", { reason: error?.name || "unknown" });
    }
  }

  // 環境音の測定（線形RMSの下位パーセンタイルをベースラインに）。
  async function calibrateBaseline(ms) {
    const samples = [];
    const until = performance.now() + ms;
    while (performance.now() < until && state.audio) {
      state.audio.analyser.getByteTimeDomainData(state.audio.timeData);
      samples.push(calculateRms(state.audio.timeData));
      await wait(45);
    }
    samples.sort((a, b) => a - b);
    const p = samples.length ? samples[Math.floor(samples.length * 0.6)] : 0;
    state.baselineRms = Math.max(Number.isFinite(p) ? p : 0, 0.004);
    state.noiseDb = rmsToDb(state.baselineRms);
    state.rmsWindow = [];
    state.lastRecalib = performance.now();
  }

  // 「記録を見る」直後の演出。医療記録の本文をターミナル風に1文字ずつ表示し、
  // その途中で緊急アラートを割り込ませてから広告の氾濫へ繋ぐ。
  function startDownloadSequence() {
    state.phase = "download";
    elements.app.dataset.phase = "download";
    elements.consoleKicker.textContent = "DOWNLOADING";
    elements.consoleKicker.classList.remove("alert");
    elements.consoleTitle.textContent = "同意書を受信中…";
    elements.recordGuidance.textContent = "未来からの同意書を、ダウンロードしています。（タップで早送り）";
    analytics.track("phase_advance", { phase: "download" });
    state.alertShown = false;
    typeText(elements.recordNote, DL_BODY, 34);
    // 警告は氾濫直前の必須ビート。タイピングの途中で割り込ませ、中央モーダルで確実に見せる。
    state.seqTimers.push(window.setTimeout(showDownloadAlert, reduceMotion ? 300 : 1500));
  }

  // 「敵対的広告群を検知しました」を独立したモーダルビートとして表示。タイピングを一時停止し、
  // 最低表示時間が経過するまで閉じられない（早送り連打でもスキップ不可）。閉じた直後に氾濫開始。
  function showDownloadAlert() {
    if (state.phase !== "download" || state.alertShown) return;
    state.alertShown = true;
    clearInterval(state.typeTimer);           // タイピングを一時停止
    elements.recordNote.classList.remove("typing");
    elements.alert.hidden = false;
    elements.alertAck.disabled = true;
    elements.alertAck.textContent = "…";
    analytics.track("phase_advance", { phase: "alert" });
    // 最低表示時間: これを過ぎて初めて「広告を確認する」で閉じられる（緊張の立ち上がりを保証）。
    const minMs = reduceMotion ? 900 : 1900;
    state.seqTimers.push(window.setTimeout(() => {
      if (state.phase !== "download") return;
      elements.alertAck.disabled = false;
      elements.alertAck.textContent = "広告を確認する";
    }, minMs));
    // 未操作時の停止防止（自動進行）。
    state.seqTimers.push(window.setTimeout(dismissDownloadAlert, minMs + 4500));
  }

  function dismissDownloadAlert() {
    if (state.phase !== "download") return;
    elements.alert.hidden = true;
    elements.recordNote.textContent = DL_BODY;  // 割り込みで止めた本文を完成させてから氾濫へ
    elements.recordNote.classList.remove("typing");
    floodAds();
  }

  // ダウンロード中のタップは演出を早送りするが、警告ビートまで（＝氾濫へは直行しない）。
  // 警告表示中はスキップ不可。
  function skipDownload() {
    if (state.phase !== "download" || state.alertShown) return;
    clearInterval(state.typeTimer);
    state.seqTimers.forEach((id) => clearTimeout(id));
    state.seqTimers = [];
    elements.recordNote.textContent = DL_BODY;
    elements.recordNote.classList.remove("typing");
    showDownloadAlert();
  }

  function typeText(el, text, cps, onDone) {
    clearInterval(state.typeTimer);
    if (reduceMotion) {
      el.classList.remove("typing");
      el.textContent = text;
      if (onDone) onDone();
      return;
    }
    el.classList.add("typing");
    el.textContent = "";
    let index = 0;
    const step = Math.max(12, Math.round(1000 / cps));
    state.typeTimer = window.setInterval(() => {
      index += 1;
      el.textContent = text.slice(0, index);
      if (index >= text.length) {
        clearInterval(state.typeTimer);
        el.classList.remove("typing");
        if (onDone) onDone();
      }
    }, step);
  }

  function setHeader(phase, count) {
    elements.phaseLabel.textContent = phase;
    elements.noticeCount.textContent = count;
  }

  function dialogPosition(index) {
    // 隙間なく重なり合って画面を埋めるため、密なグリッド＋大きめのジッタで散らす。
    const cols = mobile ? 3 : 5;
    const colW = mobile ? 32 : 19;
    const rowH = mobile ? 12 : 14;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const jx = ((index * 41) % 13) - 6;
    const jy = ((index * 29) % 9) - 4;
    return { left: 2 + col * colW + jx, top: 2 + row * rowH + jy };
  }

  // 端末幅の変化で、残っている広告の配置を現在のモバイル判定で置き直す（退場中/ドラッグ中は除く）。
  function repositionDialogs() {
    elements.dialogField
      .querySelectorAll(".system-dialog:not(.flying):not(.manual-hold)")
      .forEach((card) => {
        const index = Number(card.dataset.index);
        if (!Number.isFinite(index)) return;
        const pos = dialogPosition(index);
        card.style.left = `${pos.left}%`;
        card.style.top = `${pos.top}%`;
      });
    recomputeAdBases();
  }

  function floodAds() {
    if (state.phase !== "download") return;
    elements.alert.hidden = true;
    state.phase = "flood";
    elements.app.dataset.phase = "flood";
    elements.recordDocument.classList.add("dimmed");
    analytics.track("phase_advance", { phase: "flood" });
    ADS.forEach((ad, index) => {
      state.floodTimers.push(window.setTimeout(() => spawnAd(ad, index), 150 + index * 130));
    });
    // 氾濫の途中で、紛れて見える「ヒントの受信」を1個だけ立てる（他の広告と違い反応する）。
    state.floodTimers.push(window.setTimeout(spawnHintDialog, 150 + Math.floor(ADS.length * 0.4) * 130));
    state.floodTimers.push(window.setTimeout(onFlooded, 150 + ADS.length * 130 + 500));
  }

  // 氾濫の中に紛れた、クリックできる1個のヒント受信。広告(.system-dialog)ではないので
  // 物理・手動払いの対象外で、常に可視・タップ可能（見つける楽しさは残しつつ進行を保証）。
  function spawnHintDialog() {
    if (!["flood", "detected"].includes(state.phase) || state.hintDialogEl) return;
    const el = document.createElement("button");
    el.type = "button";
    el.id = "hint-dialog";
    el.className = "hint-dialog";
    // 見つけやすいが中央でない位置（縦600px/vvh-tiny でも上部～中段に収める）。
    el.style.left = mobile ? "14%" : "34%";
    el.style.top = mobile ? "30%" : "34%";
    el.setAttribute("aria-label", "未署名の受信を開く");
    el.innerHTML = `<span class="hint-tag">未署名の受信 // 発信元不明</span><span class="hint-body">この一件だけ、なぜか開ける。</span>`;
    el.addEventListener("click", openHint);
    elements.dialogField.append(el);
    state.hintDialogEl = el;
  }

  function removeHintDialog() {
    if (state.hintDialogEl) {
      state.hintDialogEl.remove();
      state.hintDialogEl = null;
    }
  }

  function openHint() {
    state.hintStage = 1;
    showHintStage();
    elements.hintOverlay.hidden = false;
    elements.hintOverlay.querySelector(".hint-card")?.focus?.();
  }

  function showHintStage() {
    const stage = state.hintStage;
    elements.hintText.textContent = HINTS[stage - 1];
    elements.hintLabel.textContent = stage === 1 ? "未署名の受信 // 断片 1" : "未署名の受信 // 断片 2";
    elements.hintNext.hidden = stage >= HINTS.length;
    analytics.track(`hint_open_${stage}`);
  }

  function nextHint() {
    if (state.hintStage < HINTS.length) {
      state.hintStage += 1;
      showHintStage();
    }
  }

  function closeHint() {
    elements.hintOverlay.hidden = true;
  }

  function spawnAd(ad, index) {
    if (state.phase !== "flood") return;
    // 現実の広告らしく、ほぼ整列（わずかな傾きだけ）。
    const baseR = [-1.4, 0.8, -0.6, 1.2, -1, 0.5][index % 6];
    const pos = dialogPosition(index);
    const card = document.createElement("article");
    card.className = `system-dialog appearing ad--${ad.s} ad--${ad.v}`;
    card.dataset.index = String(index);
    card.style.left = `${pos.left}%`;
    card.style.top = `${pos.top}%`;
    // 写真広告(image/article)は前面に（スマホのファーストビューで写真が目立つように）。
    const photoBoost = (ad.v === "image" || ad.v === "article") ? 40 : 0;
    card.style.zIndex = String(20 + index + photoBoost);
    card.style.transform = `translate(0px, 0px) rotate(${baseR}deg)`;
    card.style.setProperty("--r", `${baseR}deg`);
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `広告 ${index + 1}: ${ad.b}`);
    card.tabIndex = -1;
    const esc = (s) => String(s || "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]));
    const closeBtn = `<button class="dialog-close" type="button" aria-label="広告を閉じる">×</button>`;
    const header = `<header><span class="ad-badge">${esc(ad.t) || "広告"}</span>${closeBtn}</header>`;
    const go = ad.go ? `<button class="go" type="button" tabindex="-1">${esc(ad.go)}</button>` : "";
    let inner;
    if (ad.v === "image") {
      inner = `${header}<div class="ad-image"><img src="ads/${ad.img}" alt="" width="320" height="220" loading="lazy" decoding="async"><span class="ad-caption">${esc(ad.b)}</span></div>`;
    } else if (ad.v === "cookie") {
      inner = `${closeBtn}<div class="ad-body"><p>${esc(ad.b)}</p>${go}</div>`;
    } else if (ad.v === "article") {
      const thumb = ad.img ? `<div class="ad-thumb"><img src="ads/${ad.img}" alt="" width="120" height="90" loading="lazy" decoding="async"></div>` : "";
      inner = `${header}<div class="ad-body">${thumb}<p>${esc(ad.b)}</p></div><div class="dialog-footer"><span>スポンサード</span><span>広告</span></div>`;
    } else {
      // popup / warning / download / banner
      inner = `${header}<div class="ad-body"><p>${esc(ad.b)}</p>${go}</div>`;
      if (ad.v === "popup" || ad.v === "download") inner += `<div class="dialog-footer"><span>広告</span><span>PR</span></div>`;
    }
    card.innerHTML = inner;
    card.querySelector(".dialog-close").addEventListener("click", () => rejectClose(card));
    const cardImg = card.querySelector("img");
    if (cardImg) {
      cardImg.addEventListener("error", () => {
        const wrap = cardImg.closest(".ad-thumb, .ad-image");
        if (wrap) wrap.remove();
      });
    }
    installManualGesture(card);
    installAdDetailTap(card, ad);
    elements.dialogField.append(card);
    initAdPhysics(card, baseR);
    setHeader("受信記録", `広告 ${remainingDialogs()}件`);
  }

  function initAdPhysics(card, baseR) {
    const p = { bx: 0, by: 0, ox: 0, oy: 0, vx: 0, vy: 0, r: baseR };
    measureAdBase(card, p);
    state.adPhysics.set(card, p);
  }

  function measureAdBase(card, p) {
    // dialog-field 内でのカード中心（px）を基準位置として記録。offset* はリフローを
    // 伴うが spawn/resize 時のみ。以降の物理ループは getBoundingClientRect を使わない。
    p.bx = card.offsetLeft + card.offsetWidth / 2;
    p.by = card.offsetTop + card.offsetHeight / 2;
    p.hw = card.offsetWidth / 2;
    p.hh = card.offsetHeight / 2;
  }

  function recomputeAdBases() {
    state.fieldW = elements.dialogField.clientWidth || 1;
    state.fieldH = elements.dialogField.clientHeight || 1;
    state.adPhysics.forEach((p, card) => {
      if (!card.classList.contains("flying")) measureAdBase(card, p);
    });
  }

  function onFlooded() {
    if (state.phase !== "flood") return;
    state.phase = "detected";
    elements.app.dataset.phase = "detected";
    elements.consoleKicker.textContent = "AD DETECTED";
    elements.consoleKicker.classList.add("alert");
    elements.consoleTitle.textContent = "同意書が、広告に埋もれた。";
    elements.recordGuidance.textContent = "広告に阻まれ、同意できません。× でも消えません。管理人に連絡してみてください。― 回線は現在、大きな風速に弱い状態です。";
    elements.contact.hidden = false;
    if (!state.hintDialogEl) spawnHintDialog();
    setHeader("広告検知", `広告 ${remainingDialogs()}件`);
    // マイクが生きていれば、ここから広告は「強い呼気」で吹き飛ばせる（常時リスニング＋物理）。
    if (state.micReady) startPhysics();
    startIdleRescue();
    analytics.track("phase_advance", { phase: "detected" });
  }

  function rejectClose(card) {
    if (card.classList.contains("flying")) return;
    state.closeAttempts += 1;
    card.classList.remove("appearing");
    void card.offsetWidth;
    card.classList.add("appearing");
    if (["detected", "contacted", "approve"].includes(state.phase)) {
      elements.recordGuidance.textContent = state.closeAttempts === 1
        ? "×では閉じられません。広告は勝手に戻ってきます。"
        : "この広告は、どうやっても閉じられないようです。";
    }
  }

  // 管理人に連絡＝進展のように見えて、絶望的な自動応答が返るだけ（＝ボタンでは解決しない反転）。
  // 応答内に「大きな風速に弱い」という遠回しの示唆（風＝息）を紛れ込ませる。
  function showManager() {
    if (!["detected", "flood", "contacted"].includes(state.phase)) return;
    state.phase = "contacted";
    elements.app.dataset.phase = "contacted";
    elements.managerText.textContent =
      "お問い合わせありがとうございます。同意の代行はできません。担当者による確認は、最短で9日以降となります。― なお当回線は現在、大きな風速に弱い状態です。ご不便をおかけします。";
    elements.contact.hidden = true;   // 連絡後は、もう押せるボタンは出ない
    elements.manager.hidden = false;
    elements.managerCard.focus?.();
    analytics.track("phase_advance", { phase: "contacted" });
    // マイクが使えない場合のみ、静かに手動フォールバックへ誘導する（詰み回避）。
    if (!state.micReady) {
      state.seqTimers.push(window.setTimeout(offerFallback, 1400));
    }
  }

  function hideManager() {
    elements.manager.hidden = true;
  }

  // 管理人ダイアログを閉じる。以降、広告に阻まれたまま放置される（プレイヤーは推理する）。
  function dismissManager() {
    hideManager();
    if (state.phase === "contacted") {
      elements.recordGuidance.textContent = "……もう、頼れる窓口はありません。この回線で、できることを探すしかなさそうです。";
    }
  }

  // 長時間（既定90秒/150秒）進展がない場合のみ、段階的に風＝息のヒントを後出しする（詰み回避）。
  // 一度でも吹き飛ばしに成功（first_blow）したら以降は出さない。
  function startIdleRescue() {
    clearTimeout(state.hintTimer);
    state.hintTimer = window.setTimeout(() => {
      if (state.firstBlowFired || !isBlowPhase()) return;
      showResponse("回線が、かすかに揺れています。大きな風――強い空気の流れに、めっぽう弱いようです。", "回線診断");
      state.hintTimer = window.setTimeout(() => {
        if (state.firstBlowFired || !isBlowPhase()) return;
        showResponse("端末に、強く息を吹きかけてみてください。回線が“風”を拾います。", "回線診断");
        if (!state.micReady) offerFallback();
      }, 60000);
    }, 90000);
  }

  function isBlowPhase() {
    return ["flood", "detected", "contacted"].includes(state.phase);
  }

  // タブ復帰時などに、常時リスニングを取り直す（iOS はジェスチャ無しで失敗し得る→フォールバック）。
  async function reopenMic() {
    if (!state.micReady || state.audio || !isBlowPhase()) return;
    try {
      await openAudio();
      await calibrateBaseline(500);
      micInUse(true);
      startContinuousListen();
    } catch (error) {
      console.warn("Microphone reopen failed:", error?.name || error);
      await releaseMic();
      offerFallback();
    }
  }

  async function openAudio() {
    if (state.audio || state.openingAudio) return;
    if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
      throw new Error("Audio API unavailable");
    }
    state.openingAudio = true;
    try {
      // 呼気ノイズを抑圧させないため、3つの前処理を明示的に無効化する。
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        }
      });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.12;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      // 制約が実際に効いたかの切り分け用（iOS Safari 等は noiseSuppression:false を
      // 無視することがある）。?debug=1 の HUD に実値を表示する。
      const track = stream.getAudioTracks()[0];
      state.trackSettings = track && track.getSettings ? track.getSettings() : {};
      state.audio = {
        stream,
        context,
        analyser,
        source,
        timeData: new Uint8Array(analyser.fftSize),
        frequencyData: new Uint8Array(analyser.frequencyBinCount)
      };
    } finally {
      state.openingAudio = false;
    }
  }

  async function closeAudio() {
    if (!state.audio) return;
    const audio = state.audio;
    state.audio = null;
    audio.stream.getTracks().forEach((track) => track.stop());
    try {
      audio.source.disconnect();
      await audio.context.close();
    } catch {
      // A browser may already have closed the context.
    }
  }

  // 常時リスニング。冒頭でマイク許可を取って以降、ずっと解析を回す（ホールド操作は廃止）。
  // プレイヤーがいつ息を吹いても拾えるようにするための土台。
  function startContinuousListen() {
    if (!state.audio || state.listening) return;
    state.listening = true;
    state.peakThisHold = 0;
    state.pushLevel = 0;
    state.strongSince = 0;
    state.rmsWindow = [];
    state.lastRecalib = performance.now();
    analyzeFrame();
  }

  // 承認判定の中核。主判定は「時間領域RMSが環境音ベースラインの一定倍」。声との区別は
  // ノイズ様（平坦度 か ゼロ交差率のどちらか高い）を緩く要求。副作用なし＝debugで検証可。
  function isBreath(features) {
    const loudEnough = features.rms > Math.max(state.baselineRms * DETECT.ratio, DETECT.absFloor);
    const noiseLike = features.flatness > DETECT.flatMin || features.zcr > DETECT.zcrMin;
    return loudEnough && noiseLike && features.clipped < DETECT.clipMax;
  }

  function analyzeFrame(now = performance.now()) {
    if (!state.listening || !state.audio) return;
    const features = extractFeatures();
    state.features = features;

    // 入力レベル(0..1)。常時フィードバックに使う。
    const level01 = clamp((features.db - state.noiseDb) / DETECT.levelSpanDb, 0, 1);
    const noiseLike = features.flatness > DETECT.flatMin || features.zcr > DETECT.zcrMin;
    // 「強い息」= 環境音比 strongRatio 超え＋ノイズ様＋非クリップを strongHoldMs 維持。
    // これを満たしたときだけ実際に広告を押す（そよ息・話し声・環境音では動かない）。
    const loudStrong = features.rms > state.baselineRms * DETECT.strongRatio && noiseLike && features.clipped < DETECT.clipMax;
    if (loudStrong) { if (!state.strongSince) state.strongSince = now; }
    else state.strongSince = 0;
    const strongActive = state.strongSince > 0 && now - state.strongSince >= DETECT.strongHoldMs;

    state.currentLevel = level01;                    // フィードバック（インジケータ／微振動）
    state.pushLevel = strongActive ? level01 : 0;    // 押し出し力（強い息のときだけ）
    state.peakThisHold = Math.max(state.peakThisHold, level01);

    // 常時リスニングの誤発火対策: 強い息でないフレームのRMSを蓄積し、定期的に環境音ベースラインを
    // 下位パーセンタイルへ緩く追従させる（周囲の騒音が変わっても「強い息」だけを拾い続ける）。
    if (!strongActive) {
      state.rmsWindow.push(features.rms);
      if (state.rmsWindow.length > 150) state.rmsWindow.shift();
    }
    if (now - state.lastRecalib > 2500 && state.rmsWindow.length >= 24) {
      const sorted = [...state.rmsWindow].sort((a, b) => a - b);
      const q = Math.max(sorted[Math.floor(sorted.length * 0.25)], 0.004);
      state.baselineRms = state.baselineRms * 0.5 + q * 0.5;
      state.noiseDb = rmsToDb(state.baselineRms);
      state.lastRecalib = now;
    }

    elements.dialogField.style.setProperty("--level", level01.toFixed(3));
    // 反応中（届いているが弱い）＝微振動のみ。強い息＝実際に押す。
    elements.dialogField.classList.toggle("reacting", level01 > 0.06 && !strongActive);
    updateMicIndicator(level01, strongActive);

    // 初めて「強い息」で広告に干渉できた瞬間（＝謎を解いた瞬間）。以降は救済ヒントを止める。
    if (strongActive && !state.firstBlowFired && isBlowPhase() && remainingDialogs() > 0) {
      state.firstBlowFired = true;
      clearTimeout(state.hintTimer);
      hideResponse();
      analytics.track("first_blow");
    }

    updateDebug(features, strongActive, level01, now);
    state.rafId = requestAnimationFrame(analyzeFrame);
  }

  function extractFeatures() {
    const { analyser, timeData, frequencyData, context } = state.audio;
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(frequencyData);
    let squares = 0;
    let crossings = 0;
    let clipped = 0;
    let previous = timeData[0] - 128;

    for (let index = 0; index < timeData.length; index += 1) {
      const centered = timeData[index] - 128;
      const normalized = centered / 128;
      squares += normalized * normalized;
      if (Math.abs(normalized) > 0.98) clipped += 1;
      if (index > 0 && (centered >= 0) !== (previous >= 0)) crossings += 1;
      previous = centered;
    }

    const rms = Math.sqrt(squares / timeData.length);
    const db = rmsToDb(rms);
    const nyquist = context.sampleRate / 2;
    const startBin = Math.max(1, Math.floor(300 / nyquist * frequencyData.length));
    const highBin = Math.floor(2000 / nyquist * frequencyData.length);
    const endBin = Math.min(frequencyData.length - 1, Math.ceil(8000 / nyquist * frequencyData.length));
    let sum = 0;
    let highSum = 0;
    let logSum = 0;
    let count = 0;

    for (let index = startBin; index <= endBin; index += 1) {
      const magnitude = frequencyData[index] / 255;
      sum += magnitude;
      if (index >= highBin) highSum += magnitude;
      logSum += Math.log(magnitude + 0.0001);
      count += 1;
    }

    const mean = sum / Math.max(count, 1);
    return {
      rms,
      db,
      flatness: mean > 0 ? Math.exp(logSum / Math.max(count, 1)) / mean : 0,
      highRatio: sum > 0 ? highSum / sum : 0,
      zcr: crossings / timeData.length,
      clipped: clipped / timeData.length
    };
  }

  function calculateRms(timeData) {
    let sum = 0;
    for (const sample of timeData) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / timeData.length);
  }

  function rmsToDb(rms) {
    return rms > 0 ? 20 * Math.log10(rms) : -100;
  }

  function stopListen() {
    state.listening = false;
    cancelAnimationFrame(state.rafId);
    state.currentLevel = 0;
    state.pushLevel = 0;
    state.strongSince = 0;
    elements.dialogField.style.setProperty("--level", "0");
    elements.dialogField.classList.remove("reacting");
    elements.micIndicator.classList.remove("detecting");
  }

  // ===== 実時間物理: 入力レベルに比例した放射状の押し出し =====
  const FORCE = 4600;    // 押し出し加速度スケール
  const DAMP = 0.9;      // 毎フレームの速度減衰
  const SPRING = 2.2;    // 入力が弱いとき基準位置へ戻す弱いばね

  function startPhysics() {
    if (state.physicsRunning) return;
    state.physicsRunning = true;
    state.lastPhysicsTs = 0;
    recomputeAdBases();
    state.physicsRaf = requestAnimationFrame(physicsStep);
  }

  function stopPhysics() {
    state.physicsRunning = false;
    cancelAnimationFrame(state.physicsRaf);
  }

  function physicsStep(ts) {
    if (!state.physicsRunning) return;
    let dt = state.lastPhysicsTs ? (ts - state.lastPhysicsTs) / 1000 : 0.016;
    state.lastPhysicsTs = ts;
    dt = Math.min(dt, 0.05);
    const cx = state.fieldW / 2;
    const cy = state.fieldH / 2;
    const exitR = Math.hypot(state.fieldW, state.fieldH) / 2 + 70;
    const push = state.pushLevel;          // 強い息のときだけ非0＝実際に押す
    const shake = push > 0 ? 0 : state.currentLevel; // 弱い反応中は「その場の微振動」だけ
    const damp = Math.pow(DAMP, dt * 60);  // フレームレート非依存の減衰
    state.adPhysics.forEach((p, card) => {
      if (card.classList.contains("flying")) return;
      const px = p.bx + p.ox;
      const py = p.by + p.oy;
      let ux = px - cx;
      let uy = py - cy;
      let d = Math.hypot(ux, uy);
      if (d < 1) { const a = Math.random() * Math.PI * 2; ux = Math.cos(a); uy = Math.sin(a); d = 1; }
      ux /= d;
      uy /= d;
      // 力 = 強い息のレベル × 放射方向。強い息のときだけ位置が動く。
      const force = Math.max(0, push - 0.02) * FORCE;
      p.vx += ux * force * dt + (Math.random() - 0.5) * force * 0.25 * dt;
      p.vy += uy * force * dt + (Math.random() - 0.5) * force * 0.25 * dt;
      // 押していないときは基準へ弱く戻す（息を止めると少し戻る/その場に残る）。
      const back = (push > 0 ? 0.15 : 1) * SPRING;
      p.vx += -p.ox * back * dt;
      p.vy += -p.oy * back * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      // 反応中（弱い息）は積算しない極小の位置揺れだけ（点滅・明滅はしない）。reduced-motion では無し。
      const jitterAmp = reduceMotion ? 0 : 2.4;
      const jx = shake > 0.1 ? (Math.random() - 0.5) * shake * jitterAmp : 0;
      const jy = shake > 0.1 ? (Math.random() - 0.5) * shake * jitterAmp : 0;
      card.style.transform = `translate(${(p.ox + jx).toFixed(1)}px, ${(p.oy + jy).toFixed(1)}px) rotate(${p.r}deg)`;
      if (Math.hypot(px - cx, py - cy) > exitR) removeDialog(card);
    });
    if (state.physicsRunning) state.physicsRaf = requestAnimationFrame(physicsStep);
  }

  // デバッグ/強制クリア用: 全広告へ外向きの初速を与える。
  function impulseAll(strength = 1) {
    const cx = state.fieldW / 2;
    const cy = state.fieldH / 2;
    state.adPhysics.forEach((p, card) => {
      if (card.classList.contains("flying")) return;
      let ux = p.bx + p.ox - cx;
      let uy = p.by + p.oy - cy;
      const d = Math.hypot(ux, uy) || 1;
      p.vx += (ux / d) * 950 * strength;
      p.vy += (uy / d) * 950 * strength;
    });
  }

  function removeDialog(card) {
    if (card.classList.contains("flying")) return;
    card.classList.add("flying");
    state.removed += 1;
    elements.noticeCount.textContent = `広告 ${Math.max(0, remainingDialogs())}件`;
    window.setTimeout(() => {
      state.adPhysics.delete(card);
      card.remove();
      if (remainingDialogs() === 0) revealRecord();
    }, 460);
  }

  function remainingDialogs() {
    return elements.dialogField.querySelectorAll(".system-dialog:not(.flying)").length;
  }

  function revealRecord() {
    if (state.phase === "resolved" || state.phase === "clear") return;
    state.phase = "resolved";
    state.pointerActive = false;
    state.keyActive = false;
    clearTimeout(state.hintTimer);
    stopListen();
    stopPhysics();
    releaseMic();
    removeHintDialog();
    elements.micIndicator.hidden = true;
    elements.fallback.hidden = true;
    elements.contact.hidden = true;
    elements.recordDocument.classList.remove("dimmed");
    elements.recordDocument.classList.add("revealed");
    // まだ署名していない。同意書の内容が見え、最後に「承認する」で署名する。
    elements.consoleKicker.textContent = "CONSENT REQUIRED";
    elements.consoleKicker.classList.remove("alert");
    elements.consoleTitle.textContent = "同意書が、現れた。";
    elements.recordGuidance.textContent = "広告が晴れ、同意書が読めます。内容を確認し、同意してください。";
    elements.consent.hidden = false;
    setHeader("同意待ち", "広告 0件");
    analytics.track("phase_advance", { phase: "revealed" });
  }

  // 最終アクション: 同意書に署名してクリア。
  function signConsent() {
    if (state.phase !== "resolved") return;
    elements.consent.hidden = true;
    elements.recordState.textContent = "署名済";
    elements.recordDeadline.textContent = "間に合った";
    elements.recordNote.textContent = "あなたは、未来のあなたに同意した。";
    elements.recordDocument.classList.add("signed");
    elements.consoleKicker.textContent = "SIGNED";
    elements.consoleTitle.textContent = "同意、完了。";
    elements.recordGuidance.textContent = "処置が実行されます。";
    analytics.track("approve_click");
    state.clearTimer = window.setTimeout(clearGame, 900);
  }

  function clearGame() {
    if (state.phase !== "resolved") return;
    state.phase = "clear";
    elements.app.dataset.phase = "clear";
    elements.game.hidden = true;
    elements.clear.hidden = false;
    const elapsed = Math.max(1, Math.round((performance.now() - state.startedAt) / 1000));
    elements.clearDetail.textContent = `RELAY 0x07 / ${formatDuration(elapsed)} / 不達 ${state.failures}回`;
    renderScolding();
    releaseMic();
    analytics.track("game_clear", { elapsed_sec: elapsed, failures: state.failures });
  }

  // クリア後、詳細オーバーレイで契約／購入していた場合に「未来のあなた」から叱責される演出。
  // 購入ゼロならクリア画面のまま（何も出さない）。世界律「未来からの介入は必ず対価を取る」の回収。
  function renderScolding() {
    const el = elements.clearScold;
    if (!el) return;
    if (state.purchases.size === 0) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const esc = (s) => String(s || "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]));
    let total = 0;
    const rows = [];
    state.purchases.forEach((p) => {
      total += p.amount;
      rows.push(`<li><span class="scold-name">${esc(p.name)}</span><span class="scold-amount">${formatYen(p.amount)}</span></li>`);
    });
    el.innerHTML =
      `<p class="scold-from">未来のあなたより // 追伸</p>` +
      `<p class="scold-lead">……お前、回線で買い物しただろ。</p>` +
      `<ul class="scold-list">${rows.join("")}</ul>` +
      `<div class="scold-total"><span>こっちに届いた請求</span><b>${formatYen(total)}</b></div>` +
      `<p class="scold-tail">払うのは、こっちなんだよ。</p>`;
    el.hidden = false;
    analytics.track("clear_scolded", { count: state.purchases.size, total });
  }

  function offerFallback() {
    elements.fallback.hidden = false;
  }

  // マイク拒否・非対応時の詰み回避。手動（長押し＋外へスワイプ／Delete）で広告を払える。
  function enableManualMode() {
    const firstTime = !state.manualUnlocked;
    state.manualUnlocked = true;
    elements.fallback.hidden = true;
    elements.micIndicator.hidden = true;
    stopListen();
    releaseMic();
    hideManager();
    elements.contact.hidden = true;
    clearTimeout(state.hintTimer);
    if (firstTime) analytics.track("fallback_used");
    elements.consoleTitle.textContent = "手動で払う。";
    elements.dialogField.querySelectorAll(".system-dialog").forEach((card) => {
      card.classList.add("manual-ready");
      card.tabIndex = 0;
    });
    elements.recordGuidance.textContent = "広告を長押しして外へ払えます。キーボードではDeleteキー。";
    hideResponse();
  }

  function installManualGesture(card) {
    if (card.dataset.manualInstalled === "true") return;
    card.dataset.manualInstalled = "true";
    let timer = 0;
    let held = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;

    card.addEventListener("pointerdown", (event) => {
      if (!state.manualUnlocked || event.target.closest("button") || card.classList.contains("flying")) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      card.setPointerCapture(event.pointerId);
      timer = window.setTimeout(() => {
        held = true;
        card.classList.add("manual-hold");
        if (navigator.vibrate) navigator.vibrate(20);
      }, 420);
    });

    card.addEventListener("pointermove", (event) => {
      if (!held || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 17}deg)`;
      if (Math.hypot(dx, dy) >= 60) {
        held = false;
        clearTimeout(timer);
        card.classList.remove("manual-hold");
        removeDialog(card);
      }
    });

    const cancel = () => {
      clearTimeout(timer);
      if (held) {
        card.classList.remove("manual-hold");
        card.style.removeProperty("transform");
      }
      held = false;
      pointerId = null;
    };
    card.addEventListener("pointerup", cancel);
    card.addEventListener("pointercancel", cancel);
    card.addEventListener("lostpointercapture", cancel);
    card.addEventListener("keydown", (event) => {
      if (!state.manualUnlocked || !["Delete", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      removeDialog(card);
    });
  }

  // 広告カードの「短いタップ」で未来サービス詳細を開く。長押し＋スワイプの手動払い・ドラッグ・
  // 呼気物理と衝突しないよう、移動量が小さく（<10px）かつ短時間（<350ms）のタップのみをクリックと判定。
  // × ボタンは閉じる専用のまま（詳細は開かない）。飛行中は無視。
  function installAdDetailTap(card, ad) {
    if (!ad || !ad.d) return;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let downId = null;
    let moved = false;
    card.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".dialog-close") || card.classList.contains("flying")) return;
      downId = event.pointerId;
      downX = event.clientX;
      downY = event.clientY;
      downT = performance.now();
      moved = false;
    });
    card.addEventListener("pointermove", (event) => {
      if (event.pointerId !== downId) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 10) moved = true;
    });
    card.addEventListener("pointerup", (event) => {
      if (event.pointerId !== downId) return;
      downId = null;
      if (moved || card.classList.contains("flying")) return;
      if (event.target.closest(".dialog-close")) return;         // × は閉じる専用
      if (performance.now() - downT > 350) return;                // 長押し＝手動払い等はクリック扱いしない
      openAdDetail(ad);
    });
  }

  // 未来サービス詳細オーバーレイ（誇大LP＋「支払いは30年後の自分」対価UI）を開く。
  function openAdDetail(ad) {
    const d = ad && ad.d;
    if (!d) return;
    const esc = (s) => String(s || "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]));
    const img = d.img || ad.img;
    const heroHtml = img
      ? `<div class="adx-hero"><img src="ads/${img}" alt="" loading="lazy" decoding="async"><span class="adx-hero-tag">${esc(d.code)}</span></div>`
      : "";
    const bodyHtml = (d.body || []).map((p) => `<p>${esc(p)}</p>`).join("");
    const termsHtml = (d.terms || []).map((t) => `<li>${esc(t)}</li>`).join("");
    elements.adDetailBody.innerHTML =
      `<p class="adx-kicker">FUTURE SERVICE // ${esc(d.code)}</p>` +
      `<h2 id="ad-detail-name">${esc(d.name)}</h2>` +
      `<p class="adx-lead">${esc(d.lead)}</p>` +
      heroHtml +
      `<div class="adx-copy">${bodyHtml}</div>` +
      `<div class="adx-price">` +
        `<div class="adx-price-row adx-now"><span>${esc(d.nowLabel)}</span><b>${esc(d.nowPrice)}</b></div>` +
        `<div class="adx-price-row adx-future"><span>${esc(d.futureLabel)}</span><b>${esc(d.futurePrice)}</b></div>` +
      `</div>` +
      `<ul class="adx-terms">${termsHtml}</ul>` +
      `<div class="adx-total"><span>${esc(d.totalLabel)}</span><b id="adx-total-value">¥0</b></div>` +
      `<p class="adx-fine">${esc(d.fine)}</p>` +
      // 偽CTA（悪質LPトーン）。「今」は0円、支払いは30年後の自分＝世界律「未来からの介入は必ず対価を取る」。
      `<div class="adx-cta-wrap">` +
        `<button type="button" id="adx-cta" class="adx-cta">今すぐ0円で受け取る</button>` +
        `<p class="adx-cta-note" id="adx-cta-note">初期費用0円。お支払いは、すべて30年後のあなたが行います。</p>` +
      `</div>`;
    elements.adDetail.hidden = false;
    elements.adDetailCard.scrollTop = 0;
    elements.adDetailCard.focus?.();
    animateTotal(d.total);
    // 同じ広告をすでに契約済みなら、開いた時点で「契約済み」表示にする（重複購入は1回に集約）。
    if (state.purchases.has(d.code)) markCtaPurchased(false);
    const cta = document.getElementById("adx-cta");
    if (cta) cta.addEventListener("click", () => purchaseAd(ad));
    analytics.track("ad_detail_open", { ad: d.code });
  }

  // 未来サービスを「契約／購入」する。サービス名・請求額を state に蓄積し、購入完了演出を出す。
  function purchaseAd(ad) {
    const d = ad && ad.d;
    if (!d) return;
    const isNew = !state.purchases.has(d.code);
    if (isNew) {
      state.purchases.set(d.code, { name: d.name, amount: Number(d.total) || 0 });
      analytics.track("ad_purchase", { ad: d.code, amount: Number(d.total) || 0 });
    }
    markCtaPurchased(isNew);
  }

  // CTAを「契約成立」状態に切り替える（購入完了演出）。justNow=true は今このタップで成立した場合。
  function markCtaPurchased(justNow) {
    const cta = document.getElementById("adx-cta");
    const note = document.getElementById("adx-cta-note");
    if (cta) {
      cta.disabled = true;
      cta.textContent = "契約成立";
      cta.classList.add("adx-cta--done");
    }
    if (note) {
      note.classList.add("adx-cta-note--done");
      note.innerHTML = justNow
        ? "契約が成立しました。<br>この請求は、30年後のあなたへ届きます。"
        : "この契約は、すでに成立しています。<br>請求は30年後のあなたへ。";
    }
  }

  // 合計請求額のカウントアップ演出（reduced-motion では即時確定）。
  function animateTotal(target) {
    const el = document.getElementById("adx-total-value");
    if (!el) return;
    const value = Number(target) || 0;
    cancelAnimationFrame(state.adDetailRaf);
    if (reduceMotion) {
      el.textContent = formatYen(value);
      return;
    }
    const start = performance.now();
    const duration = 1200;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatYen(Math.round(value * eased));
      if (t < 1) state.adDetailRaf = requestAnimationFrame(tick);
    };
    state.adDetailRaf = requestAnimationFrame(tick);
  }

  function formatYen(n) {
    return "¥" + (Number(n) || 0).toLocaleString("ja-JP");
  }

  function closeAdDetail() {
    cancelAnimationFrame(state.adDetailRaf);
    if (elements.adDetail) elements.adDetail.hidden = true;
  }

  // 小さな常時インジケータの更新（レベルメーターと「検知中」表示）。
  function updateMicIndicator(level01, strongActive) {
    elements.micMeter.style.setProperty("--level", level01.toFixed(3));
    elements.micIndicator.classList.toggle("detecting", strongActive);
  }

  function micInUse(active) {
    elements.micIndicator.classList.toggle("mic-live", active);
  }

  async function releaseMic() {
    await closeAudio();
    micInUse(false);
  }

  function showResponse(text, label = "回線応答") {
    elements.responseLabel.textContent = label;
    elements.responseText.textContent = text;
    elements.response.hidden = false;
  }

  function hideResponse() {
    elements.response.hidden = true;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateDebug(features, breathLike, level01, now) {
    if (!debugMode) return;
    const ratioNow = features.rms / Math.max(state.baselineRms, 1e-6);
    const s = state.trackSettings || {};
    const flag = (v) => (v === undefined ? "?" : v ? "on" : "off");
    elements.debug.textContent = [
      `phase=${state.phase} breath=${breathLike} drive=${state.currentLevel.toFixed(2)}`,
      `rms=${features.rms.toFixed(4)} base=${state.baselineRms.toFixed(4)} x${ratioNow.toFixed(2)} (need x${DETECT.ratio} / peak x${DETECT.peakRatio})`,
      `level=${level01.toFixed(2)} peak=${state.peakThisHold.toFixed(2)} db=${features.db.toFixed(1)} noise=${state.noiseDb.toFixed(1)}`,
      `flat=${features.flatness.toFixed(2)}(>${DETECT.flatMin}) zcr=${features.zcr.toFixed(2)}(>${DETECT.zcrMin}) clip=${features.clipped.toFixed(3)}`,
      `constraints ec=${flag(s.echoCancellation)} ns=${flag(s.noiseSuppression)} agc=${flag(s.autoGainControl)}`,
      `fail=${state.failures} remaining=${remainingDialogs()}`
    ].join("\n");
  }

  elements.start.addEventListener("click", startGame);
  elements.restart.addEventListener("click", startGame);
  elements.contact.addEventListener("click", showManager);
  elements.managerAck.addEventListener("click", dismissManager);
  elements.micGateAllow.addEventListener("click", acceptMicGate);
  elements.consent.addEventListener("click", signConsent);
  elements.hintNext.addEventListener("click", nextHint);
  elements.hintClose.addEventListener("click", closeHint);
  // 詳細オーバーレイは × と、カード外側（バックドロップ）タップで確実に閉じられる。
  elements.adDetailClose.addEventListener("click", closeAdDetail);
  elements.adDetail.addEventListener("click", (event) => {
    if (event.target === elements.adDetail) closeAdDetail();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.adDetail.hidden) closeAdDetail();
  });
  elements.responseClose.addEventListener("click", hideResponse);
  elements.enableManual.addEventListener("click", enableManualMode);
  elements.alertAck.addEventListener("click", () => {
    if (!elements.alertAck.disabled) dismissDownloadAlert();
  });

  // ダウンロード演出中はステージのタップで早送りできる。
  elements.recordStage.addEventListener("pointerdown", () => {
    if (state.phase === "download") skipDownload();
  });

  // マイク操作ボタンは廃止（常時リスニング）。バックグラウンドでは回線を止め、復帰時に取り直す。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopListen();
      releaseMic();
    } else {
      reopenMic();
    }
  });
  window.addEventListener("pagehide", () => releaseMic());

  elements.lpLink.addEventListener("click", () => {
    analytics.track("lp_click", { link_target: elements.lpLink.href });
  });

  elements.share.addEventListener("click", async () => {
    const shareUrl = "https://games.escape-safari.com/notification-gale/";
    const shareText = "未来の自分から届いた記録を、広告スパムの下から取り戻した。「未来からの記録」";
    let shareType = "unsupported";
    try {
      if (navigator.share) {
        shareType = "native";
        await navigator.share({ title: "未来からの記録", text: shareText, url: shareUrl });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        shareType = "clipboard";
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        elements.share.textContent = "コピーしました";
        window.setTimeout(() => {
          elements.share.textContent = "結果をシェア";
        }, 2000);
      }
    } catch (error) {
      // ユーザーによるキャンセル等は握りつぶす
    }
    analytics.track("share_click", { share_type: shareType });
  });

  // --vvh 追従（Xアプリ内ブラウザ対策）＋高さゲートのクラス付与＋モバイル判定の再計算。
  function applyViewport() {
    const vv = window.visualViewport;
    const visH = Math.max(1, Math.round(vv ? vv.height : (window.innerHeight || 0)));
    const root = document.documentElement;
    root.style.setProperty("--vvh", `${visH}px`);
    root.classList.toggle("vvh-short", visH <= 640);
    root.classList.toggle("vvh-tiny", visH <= 520);
    const nextMobile = window.innerWidth <= 760;
    if (nextMobile !== mobile) {
      mobile = nextMobile;
      repositionDialogs();
    } else if (state.adPhysics.size > 0) {
      recomputeAdBases(); // 可視域(--vvh)の変化で場のサイズが変わるため基準を測り直す。
    }
  }

  window.addEventListener("resize", applyViewport);
  window.addEventListener("orientationchange", applyViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", applyViewport);
    window.visualViewport.addEventListener("scroll", applyViewport);
  }
  applyViewport();

  if (debugMode) {
    elements.debug.hidden = false;
    elements.debug.textContent = "debug ready\nF: flood / C: contact / B: blow / M: manual";
    window.gameDebug = {
      skip: skipDownload,
      // デバッグ用: 警告モーダルを飛ばして直接氾濫へ（検証の高速化用。本編フローは skipDownload）。
      flood: () => {
        if (state.phase !== "download") return;
        clearInterval(state.typeTimer);
        state.seqTimers.forEach((id) => clearTimeout(id));
        state.seqTimers = [];
        state.alertShown = true;
        elements.alert.hidden = true;
        elements.recordNote.textContent = DL_BODY;
        elements.recordNote.classList.remove("typing");
        floodAds();
      },
      contact: () => { if (isBlowPhase()) showManager(); },
      blow: (strength = 1) => { if (isBlowPhase()) impulseAll(strength); },
      hint: openHint,
      consent: signConsent,
      fallback: () => { offerFallback(); enableManualMode(); },
      getState: () => ({
        phase: state.phase,
        removed: state.removed,
        remaining: remainingDialogs(),
        micReady: state.micReady,
        micDenied: state.micDenied,
        firstBlowFired: state.firstBlowFired,
        manualUnlocked: state.manualUnlocked,
        baselineRms: state.baselineRms,
        trackSettings: state.trackSettings
      }),
      params: () => ({ ...DETECT }),
      setBaseline: (rms) => { state.baselineRms = rms; state.noiseDb = rmsToDb(rms); },
      classify: (features) => isBreath(features)
    };
    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      const key = event.key.toLowerCase();
      if (key === "f") window.gameDebug.flood();
      if (key === "c") window.gameDebug.contact();
      if (key === "b") window.gameDebug.blow();
      if (key === "m") window.gameDebug.fallback();
    });
  }
})();
