(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const debugMode = new URLSearchParams(location.search).get("debug") === "1";

  const MESSAGES = [
    ["飼育棟A／給餌報告", "夜間給餌を完了。残数に異常ありません。", "KEEPER-A"],
    ["標本庫／温湿度", "保管庫の環境値を定時記録しました。", "STORAGE-2"],
    ["正門／施錠確認", "最終巡回後、すべての門を施錠しました。", "GATE-01"],
    ["夜行性区画／観測", "消灯後の活動記録を転送します。", "NIGHT-4"],
    ["遺失物／保管連絡", "持ち主不明の鍵を一件保管しています。", "LOST-8"],
    ["回廊／清掃報告", "西回廊の清掃と消毒を完了しました。", "ROUTE-W"],
    ["本ライオン／返却", "閲覧済み蔵書を所定の棚へ戻しました。", "BOOK-0"],
    ["自動配信／要確認", "以上を夜間管理人宛に転送します。", "ROUTE-00"]
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
    recordRoom: $("#record-room"),
    receptionRoom: $("#reception-room"),
    dialogField: $("#dialog-field"),
    recordDocument: $("#record-document"),
    breathProof: $("#breath-proof"),
    returnState: $("#return-state"),
    recordGuidance: $("#record-guidance"),
    contact: $("#contact-button"),
    connect: $("#connect-button"),
    returnRecord: $("#return-record-button"),
    receptionCopy: $("#reception-copy"),
    receptionSlip: $("#reception-slip"),
    emptyWindow: $("#empty-window-message"),
    micConsole: $("#mic-console"),
    receptionMicSlot: $("#reception-mic-slot"),
    recordMicSlot: $("#record-mic-slot"),
    micButton: $("#mic-button"),
    micButtonLabel: $("#mic-button b"),
    micStateLabel: $("#mic-state-label"),
    micStatus: $("#mic-status"),
    breathProgress: $("#breath-progress"),
    response: $("#response-panel"),
    responseLabel: $("#response-label"),
    responseText: $("#response-text"),
    responseClose: $("#response-close"),
    fallback: $("#fallback-panel"),
    enableManual: $("#enable-manual-button"),
    recordPressure: $("#pressure-wave"),
    receptionPressure: $("#reception-pressure"),
    clearDetail: $("#clear-detail"),
    debug: $("#debug-panel")
  };

  const state = {
    phase: "title",
    startedAt: 0,
    tutorialSolved: false,
    removed: 0,
    closeAttempts: 0,
    failures: 0,
    phaseFailures: 0,
    manualUnlocked: false,
    micReady: false,
    noiseDb: -58,
    openingAudio: false,
    audio: null,
    pointerActive: false,
    keyActive: false,
    listening: false,
    detectedThisHold: false,
    candidateSince: 0,
    cooldownUntil: 0,
    rafId: 0,
    hintTimer: 0,
    clearTimer: 0,
    features: null
  };

  function startGame() {
    closeAudio();
    clearTimeout(state.hintTimer);
    clearTimeout(state.clearTimer);
    Object.assign(state, {
      phase: "record",
      startedAt: performance.now(),
      tutorialSolved: false,
      removed: 0,
      closeAttempts: 0,
      failures: 0,
      phaseFailures: 0,
      manualUnlocked: false,
      micReady: false,
      noiseDb: -58,
      pointerActive: false,
      keyActive: false,
      listening: false,
      detectedThisHold: false,
      candidateSince: 0
    });

    elements.app.dataset.phase = "record";
    elements.title.hidden = true;
    elements.clear.hidden = true;
    elements.game.hidden = false;
    elements.recordRoom.hidden = false;
    elements.receptionRoom.hidden = true;
    elements.contact.hidden = false;
    elements.connect.hidden = false;
    elements.connect.disabled = false;
    elements.returnRecord.hidden = true;
    elements.emptyWindow.hidden = true;
    elements.receptionSlip.hidden = false;
    elements.receptionSlip.className = "system-dialog tutorial-dialog";
    elements.receptionSlip.style.cssText = "";
    elements.recordDocument.classList.remove("revealed");
    elements.recordDocument.setAttribute("aria-hidden", "true");
    elements.breathProof.textContent = "未確認";
    elements.returnState.textContent = "保留";
    elements.micConsole.hidden = true;
    elements.fallback.hidden = true;
    elements.recordGuidance.textContent = "あなたの記録に、管理人宛の連絡が重なっています。";
    elements.receptionCopy.textContent = "管理人は席を外しています。音声伝言を残せます。";
    hideResponse();
    setHeader("記録閲覧", `管理人宛 ${MESSAGES.length}件`);
    renderDialogs();
    installManualGesture(elements.receptionSlip, true);
  }

  function setHeader(phase, count) {
    elements.phaseLabel.textContent = phase;
    elements.noticeCount.textContent = count;
  }

  function renderDialogs() {
    elements.dialogField.replaceChildren();
    const mobile = innerWidth <= 760;
    MESSAGES.forEach((message, index) => {
      const card = document.createElement("article");
      const columns = mobile ? [5, 10, 3, 8] : [5, 18, 10, 22];
      const tops = mobile ? [3, 10, 17, 24, 31, 38, 45, 52] : [4, 12, 20, 28, 36, 44, 52, 60];
      const rotations = [-1.2, 0.7, -0.5, 1.1];
      card.className = "system-dialog";
      card.dataset.index = String(index);
      card.style.left = `${columns[index % columns.length]}%`;
      card.style.top = `${tops[index]}%`;
      card.style.zIndex = String(index + 1);
      card.style.setProperty("--r", `${rotations[index % rotations.length]}deg`);
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", `管理人宛通知 ${index + 1}: ${message[0]}`);
      card.tabIndex = -1;
      card.innerHTML = `
        <header>
          <span>${message[0]}</span>
          <button class="dialog-close" type="button" aria-label="${message[0]}を閉じる">×</button>
        </header>
        <p>${message[1]}</p>
        <div class="dialog-footer"><span>TO: NIGHT KEEPER</span><span>${message[2]}</span></div>
      `;
      card.querySelector(".dialog-close").addEventListener("click", () => rejectClose(card));
      installManualGesture(card, false);
      elements.dialogField.append(card);
    });
  }

  function rejectClose(card) {
    if (card.classList.contains("flying")) return;
    state.closeAttempts += 1;
    card.classList.remove("reappearing");
    void card.offsetWidth;
    card.classList.add("reappearing");
    elements.recordGuidance.textContent = state.closeAttempts === 1
      ? "閉じても、同じ連絡がすぐ戻ってきました。"
      : "宛先本人が処理するまで再表示されるようです。";
  }

  function openReception() {
    state.phase = "reception";
    state.phaseFailures = 0;
    elements.app.dataset.phase = "reception";
    elements.recordRoom.hidden = true;
    elements.receptionRoom.hidden = false;
    elements.micConsole.hidden = true;
    elements.connect.hidden = false;
    elements.returnRecord.hidden = true;
    elements.fallback.hidden = true;
    setHeader("夜間窓口", "回線 00");
    hideResponse();
    clearTimeout(state.hintTimer);
    state.hintTimer = window.setTimeout(() => {
      if (state.phase === "reception" && !state.tutorialSolved && state.phaseFailures > 0) {
        showResponse("窓口が拾ったのは、言葉よりも空気に近い音でした。", "回線診断");
      }
    }, 45000);
  }

  async function connectMicrophone() {
    if (state.micReady || state.openingAudio) return;
    elements.connect.disabled = true;
    elements.connect.textContent = "接続を許可してください";
    elements.receptionCopy.textContent = "ブラウザの確認で、マイクの利用を許可してください。";

    try {
      await openAudio();
      elements.connect.textContent = "周囲音を測定中…";
      elements.receptionCopy.textContent = "0.7秒だけ、そのまま静かにしてください。";
      const samples = [];
      const until = performance.now() + 700;
      while (performance.now() < until && state.audio) {
        state.audio.analyser.getByteTimeDomainData(state.audio.timeData);
        samples.push(rmsToDb(calculateRms(state.audio.timeData)));
        await wait(45);
      }
      samples.sort((a, b) => a - b);
      const sample = samples[Math.floor(samples.length * 0.75)];
      state.noiseDb = Number.isFinite(sample) ? sample : -58;
      state.micReady = true;
      await closeAudio();
      elements.connect.hidden = true;
      elements.receptionCopy.textContent = "受付票が出ています。管理人へ伝言を残してください。";
      mountMicConsole(elements.receptionMicSlot);
    } catch (error) {
      console.warn("Microphone unavailable:", error?.name || error);
      await closeAudio();
      elements.connect.hidden = true;
      elements.receptionCopy.textContent = "音声窓口へ接続できませんでした。";
      offerFallback();
    } finally {
      elements.connect.disabled = false;
    }
  }

  function mountMicConsole(slot) {
    slot.append(elements.micConsole);
    elements.micConsole.hidden = false;
    resetMicUi();
  }

  async function openAudio() {
    if (state.audio || state.openingAudio) return;
    if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
      throw new Error("Audio API unavailable");
    }
    state.openingAudio = true;
    try {
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
      analyser.smoothingTimeConstant = 0.18;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
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

  async function beginHold() {
    if (!state.micReady || state.listening || state.openingAudio) return;
    hideResponse();
    try {
      setMicUi("回線接続", "マイクを開いています…");
      await openAudio();
      if (!state.pointerActive && !state.keyActive) {
        await closeAudio();
        resetMicUi();
        return;
      }
      startListening();
    } catch (error) {
      console.warn("Microphone reopen failed:", error?.name || error);
      await closeAudio();
      offerFallback();
      resetMicUi();
    }
  }

  function startListening() {
    if (!state.audio || state.listening) return;
    state.listening = true;
    state.detectedThisHold = false;
    state.candidateSince = 0;
    state.cooldownUntil = 0;
    elements.micButton.classList.add("listening");
    elements.micButtonLabel.textContent = "接続中";
    setMicUi("伝言受付中", "管理人へ音声を送っています…");
    analyzeFrame();
  }

  function analyzeFrame(now = performance.now()) {
    if (!state.listening || !state.audio) return;
    const features = extractFeatures();
    state.features = features;
    const thresholdDb = Math.max(state.noiseDb + 8, -42);
    const loudEnough = features.db > thresholdDb;
    const votes = Number(features.flatness > 0.2)
      + Number(features.highRatio > 0.31)
      + Number(features.zcr > 0.075);
    const breathLike = loudEnough && votes >= 2 && features.clipped < 0.02;

    if (breathLike && now >= state.cooldownUntil) {
      if (!state.candidateSince) state.candidateSince = now;
      const progress = Math.min(1, (now - state.candidateSince) / 420);
      elements.breathProgress.style.setProperty("--progress", progress.toFixed(3));
      setTargetsPressurized(true);
      setMicUi("気流検出", "受付票が浮いています");
      if (progress >= 1) {
        state.detectedThisHold = true;
        state.candidateSince = 0;
        state.cooldownUntil = now + 800;
        triggerBreath();
        return;
      }
    } else {
      state.candidateSince = 0;
      elements.breathProgress.style.setProperty("--progress", "0");
      setTargetsPressurized(false);
      setMicUi("伝言受付中", "管理人へ音声を送っています…");
    }

    updateDebug(features, thresholdDb, breathLike, now);
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

  async function endHold({ countFailure = true } = {}) {
    const wasListening = state.listening;
    state.listening = false;
    cancelAnimationFrame(state.rafId);
    setTargetsPressurized(false);
    elements.breathProgress.style.setProperty("--progress", "0");
    elements.micButton.classList.remove("listening");
    elements.micButtonLabel.textContent = "押して話す";
    await closeAudio();
    resetMicUi();

    if (wasListening && countFailure && !state.detectedThisHold && ["record", "reception"].includes(state.phase)) {
      registerFailure();
    }
  }

  function triggerBreath() {
    if (state.phase === "reception" && !state.tutorialSolved) {
      solveTutorial(false);
    } else if (state.phase === "record" && state.tutorialSolved) {
      blowDialogBatch();
    }
    state.pointerActive = false;
    state.keyActive = false;
    endHold({ countFailure: false });
  }

  function solveTutorial(manual) {
    if (state.tutorialSolved) return;
    state.tutorialSolved = true;
    clearTimeout(state.hintTimer);
    animatePressure(elements.receptionPressure);
    const direction = manual ? 1 : -1;
    const slip = elements.receptionSlip;
    slip.classList.remove("pressurized", "manual-hold");
    slip.classList.add("flying");
    slip.style.transform = `translate(${direction * (innerWidth + 450)}px, -120px) rotate(${direction * 26}deg)`;
    window.setTimeout(() => {
      slip.hidden = true;
      elements.emptyWindow.hidden = false;
      elements.receptionCopy.textContent = "管理人の姿はありません。受付票だけが消えました。";
      elements.returnRecord.hidden = false;
      elements.micConsole.hidden = true;
      elements.fallback.hidden = true;
    }, 680);
  }

  function returnToRecord() {
    state.phase = "record";
    state.phaseFailures = 0;
    elements.app.dataset.phase = "record";
    elements.receptionRoom.hidden = true;
    elements.recordRoom.hidden = false;
    elements.contact.hidden = true;
    elements.recordGuidance.textContent = "夜間窓口と同じ回線が、まだつながっています。";
    setHeader("記録閲覧", `管理人宛 ${remainingDialogs()}件`);
    if (state.micReady && !state.manualUnlocked) {
      mountMicConsole(elements.recordMicSlot);
    } else if (state.manualUnlocked) {
      enableManualMode();
    }
    hideResponse();
  }

  function blowDialogBatch() {
    const remaining = [...elements.dialogField.querySelectorAll(".system-dialog:not(.flying)")];
    if (!remaining.length) return;
    const batch = remaining.slice(-Math.min(3, remaining.length));
    animatePressure(elements.recordPressure);
    batch.forEach((card, index) => {
      const direction = (Number(card.dataset.index) + index) % 2 ? 1 : -1;
      card.classList.remove("pressurized");
      window.setTimeout(() => removeDialog(card, direction), index * 70);
    });
  }

  function removeDialog(card, direction) {
    if (card.classList.contains("flying")) return;
    card.classList.add("flying");
    card.style.transform = `translate(${direction * (innerWidth + 520)}px, ${-80 - state.removed * 8}px) rotate(${direction * 29}deg)`;
    state.removed += 1;
    setHeader("記録閲覧", `管理人宛 ${Math.max(0, MESSAGES.length - state.removed)}件`);
    window.setTimeout(() => {
      card.remove();
      if (remainingDialogs() === 0) revealRecord();
    }, 700);
  }

  function remainingDialogs() {
    return elements.dialogField.querySelectorAll(".system-dialog:not(.flying)").length;
  }

  function revealRecord() {
    if (state.phase === "resolved") return;
    state.phase = "resolved";
    state.pointerActive = false;
    state.keyActive = false;
    endHold({ countFailure: false });
    elements.micConsole.hidden = true;
    elements.fallback.hidden = true;
    elements.recordDocument.setAttribute("aria-hidden", "false");
    elements.recordDocument.classList.add("revealed");
    setHeader("生存確認", "誤配 0件");
    window.setTimeout(() => {
      elements.breathProof.textContent = "呼気あり";
      elements.returnState.textContent = "記録外へ返還";
    }, 380);
    state.clearTimer = window.setTimeout(clearGame, 2500);
  }

  function clearGame() {
    if (state.phase !== "resolved") return;
    state.phase = "clear";
    elements.app.dataset.phase = "clear";
    elements.game.hidden = true;
    elements.clear.hidden = false;
    const elapsed = Math.max(1, Math.round((performance.now() - state.startedAt) / 1000));
    elements.clearDetail.textContent = `RECORD 0711-N / ${formatDuration(elapsed)} / 不達 ${state.failures}回`;
    closeAudio();
  }

  function registerFailure() {
    state.failures += 1;
    state.phaseFailures += 1;
    if (state.phaseFailures >= 4) {
      showResponse("回線状態が安定しません。手動で続けることもできます。", "回線診断");
      offerFallback();
      return;
    }
    if (state.phase === "reception") {
      const message = state.phaseFailures >= 2
        ? "伝言は届いています。受付票の端だけが震えています。"
        : "伝言を受理しました。管理人の確認は明朝です。";
      showResponse(message);
    } else {
      const message = state.phaseFailures >= 2
        ? "夜間窓口で、動いたものを思い出してください。"
        : "管理人からの応答はありません。";
      showResponse(message);
    }
  }

  function offerFallback() {
    elements.fallback.hidden = false;
  }

  function enableManualMode() {
    state.manualUnlocked = true;
    elements.fallback.hidden = true;
    elements.micConsole.hidden = true;
    if (state.phase === "reception") {
      elements.receptionSlip.classList.add("manual-ready");
      elements.receptionSlip.tabIndex = 0;
      elements.receptionCopy.textContent = "受付票を長押しして左右へ払えます。";
    } else {
      elements.dialogField.querySelectorAll(".system-dialog").forEach((card) => {
        card.classList.add("manual-ready");
        card.tabIndex = 0;
      });
      elements.recordGuidance.textContent = "通知を長押しして左右へ払えます。キーボードではDeleteキー。";
    }
    hideResponse();
  }

  function installManualGesture(card, tutorial) {
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
      }, 480);
    });

    card.addEventListener("pointermove", (event) => {
      if (!held || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      card.style.transform = tutorial
        ? `translate(calc(-50% + ${dx}px), ${dy}px) rotate(${dx / 17}deg)`
        : `translate(${dx}px, ${dy}px) rotate(${dx / 17}deg)`;
      if (Math.abs(dx) >= 56) {
        held = false;
        clearTimeout(timer);
        card.classList.remove("manual-hold");
        if (tutorial) solveTutorial(true);
        else removeDialog(card, Math.sign(dx) || 1);
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
      if (tutorial) solveTutorial(true);
      else removeDialog(card, 1);
    });
  }

  function setTargetsPressurized(active) {
    if (state.phase === "reception" && !state.tutorialSolved) {
      elements.receptionSlip.classList.toggle("pressurized", active);
      return;
    }
    if (state.phase === "record") {
      const remaining = [...elements.dialogField.querySelectorAll(".system-dialog:not(.flying)")];
      remaining.slice(-3).forEach((card) => card.classList.toggle("pressurized", active));
    }
  }

  function animatePressure(layer) {
    layer.classList.remove("active");
    void layer.offsetWidth;
    layer.classList.add("active");
  }

  function setMicUi(label, status) {
    elements.micStateLabel.textContent = label;
    elements.micStatus.textContent = status;
  }

  function resetMicUi() {
    setMicUi("回線待機", "押している間だけ、音声を確認します");
    elements.micButton.classList.remove("listening");
    elements.micButtonLabel.textContent = "押して話す";
    elements.breathProgress.style.setProperty("--progress", "0");
  }

  function showResponse(text, label = "窓口応答") {
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

  function updateDebug(features, threshold, candidate, now) {
    if (!debugMode) return;
    const held = state.candidateSince ? Math.round(now - state.candidateSince) : 0;
    elements.debug.textContent = [
      `phase=${state.phase} candidate=${candidate} held=${held}ms`,
      `db=${features.db.toFixed(1)} threshold=${threshold.toFixed(1)} noise=${state.noiseDb.toFixed(1)}`,
      `flat=${features.flatness.toFixed(2)} high=${features.highRatio.toFixed(2)}`,
      `zcr=${features.zcr.toFixed(2)} clip=${features.clipped.toFixed(3)}`,
      `fail=${state.failures} remaining=${remainingDialogs()}`
    ].join("\n");
  }

  elements.start.addEventListener("click", startGame);
  elements.restart.addEventListener("click", startGame);
  elements.contact.addEventListener("click", openReception);
  elements.connect.addEventListener("click", connectMicrophone);
  elements.returnRecord.addEventListener("click", returnToRecord);
  elements.responseClose.addEventListener("click", hideResponse);
  elements.enableManual.addEventListener("click", enableManualMode);

  elements.micButton.addEventListener("pointerdown", (event) => {
    if (!state.micReady || !["record", "reception"].includes(state.phase)) return;
    event.preventDefault();
    state.pointerActive = true;
    elements.micButton.setPointerCapture?.(event.pointerId);
    beginHold();
  });
  elements.micButton.addEventListener("pointerup", (event) => {
    state.pointerActive = false;
    if (elements.micButton.hasPointerCapture?.(event.pointerId)) {
      elements.micButton.releasePointerCapture(event.pointerId);
    }
    if (!state.keyActive) endHold();
  });
  elements.micButton.addEventListener("pointercancel", () => {
    state.pointerActive = false;
    if (!state.keyActive) endHold();
  });
  elements.micButton.addEventListener("lostpointercapture", () => {
    state.pointerActive = false;
    if (!state.keyActive) endHold();
  });
  elements.micButton.addEventListener("keydown", (event) => {
    if (![" ", "Enter"].includes(event.key) || event.repeat || !state.micReady) return;
    event.preventDefault();
    state.keyActive = true;
    beginHold();
  });
  elements.micButton.addEventListener("keyup", (event) => {
    if (![" ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    state.keyActive = false;
    if (!state.pointerActive) endHold();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    state.pointerActive = false;
    state.keyActive = false;
    endHold({ countFailure: false });
  });
  window.addEventListener("pagehide", () => closeAudio());

  if (debugMode) {
    elements.debug.hidden = false;
    elements.debug.textContent = "debug ready\nT: tutorial / B: blow / V: fail / M: manual";
    window.gameDebug = {
      tutorialBreath: () => {
        if (state.phase === "reception") solveTutorial(false);
      },
      blow: () => {
        if (state.phase === "record" && state.tutorialSolved) blowDialogBatch();
      },
      fail: registerFailure,
      fallback: () => {
        offerFallback();
        enableManualMode();
      },
      getState: () => ({
        phase: state.phase,
        tutorialSolved: state.tutorialSolved,
        failures: state.failures,
        removed: state.removed,
        remaining: remainingDialogs(),
        manualUnlocked: state.manualUnlocked
      })
    };
    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      const key = event.key.toLowerCase();
      if (key === "t") window.gameDebug.tutorialBreath();
      if (key === "b") window.gameDebug.blow();
      if (key === "v") window.gameDebug.fail();
      if (key === "m") window.gameDebug.fallback();
    });
  }
})();
