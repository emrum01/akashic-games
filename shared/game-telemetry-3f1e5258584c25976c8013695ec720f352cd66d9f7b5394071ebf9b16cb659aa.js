/*
 * Shared, privacy-limited GA4 telemetry for classic browser game pages.
 * It creates a queue and one async gtag loader only on the exact production
 * host. Page URLs are stripped of query/hash, while event data is allowlisted.
 */
(function installAkashicTelemetry(root) {
  "use strict";

  if (!root) {
    return;
  }
  if (root.AkashicTelemetry) {
    try {
      if (typeof module === "object" && module.exports) {
        module.exports = root.AkashicTelemetry;
      }
    } catch (_) {}
    return;
  }

  const MEASUREMENT_ID = "G-G9MYW7GEC1";
  const GTAG_SCRIPT_ID = "akashic-ga4-gtag-loader";
  const GTAG_SCRIPT_SRC = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
  const CHECKPOINT_MS = 30 * 1000;
  const OWNER_HEARTBEAT_MS = 5 * 1000;
  const OWNER_LEASE_MS = 15 * 1000;
  const STORAGE_PREFIX = "akashic:game-telemetry:v3:";
  const LOCK_PREFIX = "akashic-game-telemetry-v3:";
  // A frozen/throttled visible page should not add hours in one sample. Normal
  // visible thinking is sampled every 30 seconds and is never idle-timed out.
  const MAX_SAMPLE_GAP_MS = 5 * 60 * 1000;
  const MAX_STEP = 1000000;
  const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
  // Shared play records persist in localStorage across reloads. The document
  // owner id stays in memory so duplicated tabs coordinate time independently.
  const instanceByGame = Object.create(null);
  let activeInstance = null;
  let gaConfigured = false;
  let gaJsInitialized = false;
  let gaScriptHandled = false;
  let analyticsEligibleAtLoad = false;
  let fallbackPlayIdCounter = 0;
  let heartbeat = null;
  let heartbeatOwner = null;
  const documentId = createPlayId();

  function safely(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function token(value) {
    return typeof value === "string" && TOKEN_RE.test(value) ? value : null;
  }

  function createPlayId() {
    // Random ids identify a play generation, play, or live document. Play and
    // generation ids persist with the game's record; none identifies a user.
    const bytes = safely(function () {
      return new Uint8Array(16);
    }, null);
    if (!bytes) {
      return null;
    }
    const filled = safely(function () {
      if (!root.crypto || typeof root.crypto.getRandomValues !== "function") {
        return false;
      }
      root.crypto.getRandomValues(bytes);
      return true;
    }, false);
    if (!filled) {
      fallbackPlayIdCounter += 1;
      let seed = (wallNow() ^ (fallbackPlayIdCounter * 0x9e3779b9)) >>> 0;
      for (let i = 0; i < bytes.length; i += 1) {
        seed = (Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) + 0x27100001) >>> 0;
        const randomByte = safely(function () {
          return Math.floor(Math.random() * 256);
        }, 0);
        bytes[i] = (seed ^ randomByte) & 0xff;
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [];
    for (let j = 0; j < bytes.length; j += 1) {
      hex.push((bytes[j] + 0x100).toString(16).slice(1));
    }
    return (
      hex.slice(0, 4).join("") +
      "-" +
      hex.slice(4, 6).join("") +
      "-" +
      hex.slice(6, 8).join("") +
      "-" +
      hex.slice(8, 10).join("") +
      "-" +
      hex.slice(10, 16).join("")
    );
  }

  function wallNow() {
    return safely(function () {
      return Date.now();
    }, 0);
  }

  function monotonicNow() {
    return safely(function () {
      if (root.performance && typeof root.performance.now === "function") {
        return root.performance.now();
      }
      return Date.now();
    }, 0);
  }

  function isVisible() {
    return safely(function () {
      const doc = root.document;
      return !doc || (doc.visibilityState !== "hidden" && doc.hidden !== true);
    }, false);
  }

  function parseQuery(search) {
    const SearchParams = safely(function () {
      return root.URLSearchParams || URLSearchParams;
    }, null);
    if (typeof SearchParams !== "function") {
      return search ? null : new URLSearchParams("");
    }
    return safely(function () {
      return new SearchParams(search || "");
    }, null);
  }

  function hasTestSwitch(params) {
    let found = false;
    if (!params) {
      return true;
    }
    params.forEach(function (value, key) {
      const normalizedKey = String(key)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const normalizedValue = String(value).trim().toLowerCase();
      if (
        /^(debug|preview|qa|test|testing|e2e|automation|playwright|selenium|webdriver)/.test(
          normalizedKey
        )
      ) {
        found = true;
      }
      if (
        /^(mode|env|environment|build|target)$/.test(normalizedKey) &&
        /^(debug|preview|qa|test|testing|e2e|automation)$/.test(normalizedValue)
      ) {
        found = true;
      }
    });
    return found;
  }

  function currentAnalyticsContextAllowed() {
    return safely(function () {
      const location = root.location;
      const navigator = root.navigator;
      if (!location || location.hostname !== "games.escape-safari.com") {
        return false;
      }
      if (location.protocol !== "https:") {
        return false;
      }
      if (!navigator || navigator.webdriver !== false) {
        return false;
      }
      if (hasTestSwitch(parseQuery(location.search || ""))) {
        return false;
      }
      const switches = [
        "__AKASHIC_DEBUG__",
        "__AKASHIC_PREVIEW__",
        "__AKASHIC_QA__",
        "__AKASHIC_TEST__",
        "__E2E__",
        "__PLAYWRIGHT__",
      ];
      if (
        switches.some(function (name) {
          return Boolean(root[name]);
        })
      ) {
        return false;
      }
      return true;
    }, false);
  }

  function analyticsAllowed() {
    return analyticsEligibleAtLoad && currentAnalyticsContextAllowed();
  }

  function urlWithoutQueryOrHash(value) {
    if (typeof value !== "string" || !value) {
      return null;
    }
    return safely(function () {
      const Url = root.URL || URL;
      const parsed = new Url(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      const result = parsed.origin + parsed.pathname;
      return result.length <= 512 ? result : null;
    }, null);
  }

  function pageLocation() {
    return safely(function () {
      const location = root.location;
      if (!location) {
        return null;
      }
      let href = typeof location.href === "string" ? location.href : null;
      if (!href && location.protocol && location.host) {
        href = location.protocol + "//" + location.host + (location.pathname || "/");
      }
      return urlWithoutQueryOrHash(href);
    }, null);
  }

  function pageReferrer() {
    return safely(function () {
      const referrer = root.document && root.document.referrer;
      return urlWithoutQueryOrHash(referrer);
    }, null);
  }

  function safeMarketingParams() {
    return safely(function () {
      const location = root.location;
      const params = parseQuery(location && location.search);
      if (!params) {
        return {};
      }
      const result = {};
      const mappings = {
        utm_source: ["source", "campaign_source"],
        utm_medium: ["medium", "campaign_medium"],
        utm_campaign: ["campaign", "campaign_name"],
        utm_content: ["content", "campaign_content"],
      };
      Object.keys(mappings).forEach(function (name) {
        const value = token(params.get(name));
        if (value) {
          result[name] = value;
          mappings[name].forEach(function (mappedName) {
            result[mappedName] = value;
          });
        }
      });
      return result;
    }, {});
  }

  function addSanitizedPageContext(params) {
    params.page_location = pageLocation() || "";
    params.page_referrer = pageReferrer() || "";
    const marketing = safeMarketingParams();
    Object.keys(marketing).forEach(function (key) {
      params[key] = marketing[key];
    });
    return params;
  }

  function gtagConfigParams() {
    return addSanitizedPageContext({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }

  function elapsedBucket(seconds) {
    if (seconds < 30) {
      return "0-30s";
    }
    if (seconds < 60) {
      return "30-60s";
    }
    if (seconds < 120) {
      return "1-2m";
    }
    if (seconds < 300) {
      return "2-5m";
    }
    if (seconds < 600) {
      return "5-10m";
    }
    if (seconds < 1200) {
      return "10-20m";
    }
    return "20m+";
  }

  function freshState() {
    return {
      generation: createPlayId(),
      started: false,
      cleared: false,
      failed: false,
      playId: null,
      observationSeq: 0,
      paused: true,
      resumeArmed: false,
      timeOwner: false,
      activeMs: 0,
      lastSampleAt: null,
      lastCheckpointActiveMs: 0,
      stage: "playing",
      step: 0,
      hints: 0,
      wrongAnswers: 0,
      checkpoints: 0,
    };
  }

  function decodeStoredRecord(raw, gameId) {
    if (typeof raw !== "string") {
      return null;
    }
    const value = JSON.parse(raw);
    if (
      !value ||
      value.schema !== 1 ||
      value.game_id !== gameId ||
      !token(value.generation) ||
      typeof value.joinable !== "boolean" ||
      !["pending", "playing", "cleared", "failed"].includes(value.status) ||
      !Number.isSafeInteger(value.observation_seq) ||
      value.observation_seq < 0 ||
      !Number.isFinite(value.active_ms) ||
      value.active_ms < 0 ||
      !token(value.stage) ||
      !Number.isSafeInteger(value.step) ||
      value.step < 0 ||
      !Number.isFinite(value.last_checkpoint_active_ms) ||
      value.last_checkpoint_active_ms < 0
    ) {
      return null;
    }
    const playId = value.play_id === null ? null : token(value.play_id);
    if ((value.status !== "pending" && !playId) || (value.status === "pending" && playId)) {
      return null;
    }
    let timeOwner = null;
    if (value.time_owner !== null) {
      if (
        !value.time_owner ||
        !token(value.time_owner.document_id) ||
        !Number.isFinite(value.time_owner.lease_until) ||
        value.time_owner.lease_until < 0
      ) {
        return null;
      }
      timeOwner = {
        document_id: value.time_owner.document_id,
        lease_until: value.time_owner.lease_until,
      };
    }
    return {
      schema: 1,
      game_id: gameId,
      generation: value.generation,
      joinable: value.joinable,
      play_id: playId,
      observation_seq: value.observation_seq,
      status: value.status,
      stage: value.stage,
      step: value.step,
      active_ms: value.active_ms,
      last_checkpoint_active_ms: value.last_checkpoint_active_ms,
      hints: Number.isSafeInteger(value.hints) && value.hints >= 0 ? value.hints : 0,
      wrong_answers:
        Number.isSafeInteger(value.wrong_answers) && value.wrong_answers >= 0
          ? value.wrong_answers
          : 0,
      checkpoints:
        Number.isSafeInteger(value.checkpoints) && value.checkpoints >= 0 ? value.checkpoints : 0,
      time_owner: timeOwner,
    };
  }

  function recordFromState(instance, generation, joinable) {
    const state = instance.state;
    return {
      schema: 1,
      game_id: instance.gameId,
      generation: generation,
      joinable: Boolean(joinable),
      play_id: null,
      observation_seq: 0,
      status: "pending",
      stage: token(state.stage) || "playing",
      step: state.step,
      active_ms: 0,
      last_checkpoint_active_ms: 0,
      hints: 0,
      wrong_answers: 0,
      checkpoints: 0,
      time_owner: null,
    };
  }

  function stateFromRecord(record) {
    const state = freshState();
    state.generation = record.generation;
    state.started = record.status !== "pending";
    state.cleared = record.status === "cleared";
    state.failed = record.status === "failed";
    state.playId = record.play_id;
    state.observationSeq = record.observation_seq;
    state.paused = state.started;
    state.resumeArmed = state.started;
    state.activeMs = record.active_ms;
    state.lastCheckpointActiveMs = record.last_checkpoint_active_ms;
    state.stage = record.stage;
    state.step = record.step;
    state.hints = record.hints;
    state.wrongAnswers = record.wrong_answers;
    state.checkpoints = record.checkpoints;
    return state;
  }

  function persistentContext(gameId) {
    if (!analyticsAllowed()) {
      return { enabled: false, record: null };
    }
    return safely(
      function () {
        const storage = root.localStorage;
        const locks = root.navigator && root.navigator.locks;
        if (
          !storage ||
          typeof storage.getItem !== "function" ||
          typeof storage.setItem !== "function" ||
          !locks ||
          typeof locks.request !== "function"
        ) {
          return { enabled: false, record: null };
        }
        const raw = storage.getItem(STORAGE_PREFIX + gameId);
        let record = null;
        if (typeof raw === "string") {
          try {
            record = decodeStoredRecord(raw, gameId);
          } catch (_) {
            record = null;
          }
        }
        return {
          enabled: true,
          storage: storage,
          locks: locks,
          record: record,
        };
      },
      { enabled: false, record: null }
    );
  }

  function activeSeconds(state) {
    return Math.floor(Math.max(0, state.activeMs) / 1000);
  }

  function sampleActiveTime(state, finalVisibleSample) {
    if (
      !state.started ||
      state.cleared ||
      state.failed ||
      state.paused ||
      !state.timeOwner ||
      (!finalVisibleSample && !isVisible())
    ) {
      return;
    }
    const now = monotonicNow();
    if (state.lastSampleAt === null) {
      state.lastSampleAt = now;
      return;
    }
    const delta = now - state.lastSampleAt;
    state.lastSampleAt = now;
    if (Number.isFinite(delta) && delta > 0) {
      state.activeMs += Math.min(delta, MAX_SAMPLE_GAP_MS);
    }
  }

  function eventParams(instance, record, status) {
    const seconds = Math.floor(Math.max(0, record.active_ms) / 1000);
    const params = {
      send_to: MEASUREMENT_ID,
      telemetry_version: 1,
      game_id: instance.gameId,
      play_id: record.play_id,
      observation_seq: record.observation_seq,
      game_stage: token(record.stage) || "playing",
      game_step: Number.isInteger(record.step) && record.step >= 0 ? record.step : 0,
      active_seconds: seconds,
      elapsed_bucket: elapsedBucket(seconds),
      play_status: status,
    };
    if (instance.revision) {
      params.game_revision = instance.revision;
    }
    return addSanitizedPageContext(params);
  }

  function existingGtagScript() {
    return safely(function () {
      const doc = root.document;
      if (!doc) {
        return false;
      }
      if (typeof doc.getElementById === "function" && doc.getElementById(GTAG_SCRIPT_ID)) {
        return true;
      }
      if (typeof doc.getElementsByTagName !== "function") {
        return false;
      }
      const scripts = doc.getElementsByTagName("script");
      return Array.from(scripts || []).some(function (script) {
        const src =
          script &&
          (script.src || (typeof script.getAttribute === "function" && script.getAttribute("src")));
        return (
          typeof src === "string" &&
          src.indexOf("https://www.googletagmanager.com/gtag/js") === 0 &&
          src.indexOf("id=" + MEASUREMENT_ID) !== -1
        );
      });
    }, false);
  }

  function loadGtagScript() {
    if (gaScriptHandled || existingGtagScript()) {
      gaScriptHandled = true;
      return;
    }
    safely(function () {
      const doc = root.document;
      if (!doc || typeof doc.createElement !== "function") {
        return;
      }
      const parent = doc.head || doc.documentElement || doc.body;
      if (!parent || typeof parent.appendChild !== "function") {
        return;
      }
      const script = doc.createElement("script");
      script.id = GTAG_SCRIPT_ID;
      script.async = true;
      script.src = GTAG_SCRIPT_SRC;
      // Do not retry a blocked append on every gameplay event.
      gaScriptHandled = true;
      parent.appendChild(script);
    }, undefined);
  }

  function findDataLayerCommand(command, value) {
    return safely(function () {
      const dataLayer = root.dataLayer;
      if (!Array.isArray(dataLayer)) {
        return null;
      }
      for (let i = 0; i < dataLayer.length; i += 1) {
        const item = dataLayer[i];
        if (item && item[0] === command && (value === undefined || item[1] === value)) {
          return item;
        }
      }
      return null;
    }, null);
  }

  function dataLayerHasCommand(command, value) {
    return findDataLayerCommand(command, value) !== null;
  }

  function sanitizeQueuedConfig(command, params) {
    return safely(function () {
      if (!command) {
        return false;
      }
      const queuedParams =
        command[2] && typeof command[2] === "object" ? Object.assign({}, command[2]) : {};
      Object.keys(params).forEach(function (key) {
        queuedParams[key] = params[key];
      });
      command[2] = queuedParams;
      return true;
    }, false);
  }

  function ensureGtag() {
    if (!analyticsAllowed()) {
      return null;
    }
    let gtag = safely(function () {
      return root.gtag;
    }, null);
    if (typeof gtag !== "function") {
      const created = safely(function () {
        // A present non-function gtag or non-array dataLayer may belong to
        // another integration. Leave it intact and fail closed in that case.
        if (root.gtag !== undefined) {
          return null;
        }
        let dataLayer = root.dataLayer;
        if (dataLayer === undefined) {
          dataLayer = [];
          root.dataLayer = dataLayer;
        }
        if (!Array.isArray(dataLayer)) {
          return null;
        }
        const queue = function () {
          dataLayer.push(arguments);
        };
        root.gtag = queue;
        if (root.gtag !== queue) {
          return null;
        }
        return queue;
      }, null);
      gtag = created;
    }
    if (typeof gtag !== "function") {
      return null;
    }

    if (!gaConfigured) {
      // Set before calling: a transport that throws after queueing must not
      // cause a duplicate GA config on a later gameplay event.
      gaConfigured = true;
      const configParams = gtagConfigParams();
      // New Google tags can initialize their destination on the js command.
      // Apply safe context and suppress automatic views before that command.
      // Stream settings separately disable Enhanced Measurement URL fields.
      safely(function () {
        gtag("set", Object.assign({}, configParams));
      }, undefined);
      if (!dataLayerHasCommand("js") && !gaJsInitialized) {
        gaJsInitialized = true;
        safely(function () {
          gtag("js", new Date());
        }, undefined);
      }
      const existingConfig = findDataLayerCommand("config", MEASUREMENT_ID);
      if (existingConfig) {
        sanitizeQueuedConfig(existingConfig, configParams);
      } else {
        safely(function () {
          gtag("config", MEASUREMENT_ID, configParams);
        }, undefined);
      }
    }
    loadGtagScript();
    return gtag;
  }

  function pageViewParams(instance) {
    const params = {
      send_to: MEASUREMENT_ID,
      telemetry_version: 1,
      game_id: instance.gameId,
    };
    if (instance.revision) {
      params.game_revision = instance.revision;
    }
    return addSanitizedPageContext(params);
  }

  function sendPageView(instance) {
    if (instance.pageViewed) {
      return false;
    }
    const gtag = ensureGtag();
    if (!gtag) {
      return false;
    }
    const params = pageViewParams(instance);
    // Mark before transport: an implementation that queues and then throws
    // still receives at most one page_view for this game instance.
    instance.pageViewed = true;
    return safely(function () {
      gtag("event", "page_view", params);
      return true;
    }, false);
  }

  function cloneRecord(record) {
    return Object.assign({}, record, {
      time_owner: record.time_owner ? Object.assign({}, record.time_owner) : null,
    });
  }

  function writeStoredRecord(instance, record) {
    instance.storage.setItem(STORAGE_PREFIX + instance.gameId, JSON.stringify(record));
  }

  function renewOrClaimTimeOwner(record, instance, operation) {
    if (!operation.visibleAt) {
      return false;
    }
    const now = wallNow();
    if (
      record.time_owner &&
      record.time_owner.document_id === documentId &&
      record.time_owner.lease_until > operation.observedWall
    ) {
      record.time_owner.lease_until = now + OWNER_LEASE_MS;
      instance.state.timeOwner = true;
      instance.timeOwner = true;
      return false;
    }
    if (record.time_owner && record.time_owner.lease_until > operation.observedWall) {
      return false;
    }
    record.time_owner = {
      document_id: documentId,
      lease_until: now + OWNER_LEASE_MS,
    };
    instance.state.timeOwner = true;
    instance.timeOwner = true;
    instance.timeSampleAt = operation.observedAt;
    return true;
  }

  function updateOwnedTime(record, instance, finalVisibleSample, operation) {
    if (
      !record.time_owner ||
      record.time_owner.document_id !== documentId ||
      record.time_owner.lease_until <= operation.observedWall
    ) {
      return false;
    }
    const sampleAt = instance.timeSampleAt;
    if (sampleAt !== null && (finalVisibleSample || operation.visibleAt)) {
      const delta = operation.observedAt - sampleAt;
      if (Number.isFinite(delta) && delta > 0) {
        record.active_ms += Math.min(delta, MAX_SAMPLE_GAP_MS);
      }
    }
    instance.timeSampleAt = operation.visibleAt ? operation.observedAt : null;
    record.time_owner.lease_until = wallNow() + OWNER_LEASE_MS;
    return true;
  }

  function applyOperationStage(record, operation) {
    if (operation.hasStage && operation.stage) {
      record.stage = operation.stage;
    }
    if (operation.hasStep && Number.isSafeInteger(operation.step) && operation.step >= 0) {
      record.step = Math.min(MAX_STEP, operation.step);
    }
  }

  function makeOperationEvent(record, eventName, status) {
    if (!record.play_id || !Number.isSafeInteger(record.observation_seq + 1)) {
      return null;
    }
    record.observation_seq += 1;
    return { name: eventName, status: status, record: cloneRecord(record) };
  }

  function applyStoredOperation(instance, operation) {
    const raw = instance.storage.getItem(STORAGE_PREFIX + instance.gameId);
    let record = null;
    if (typeof raw === "string") {
      try {
        record = decodeStoredRecord(raw, instance.gameId);
      } catch (_) {
        record = null;
      }
    }

    if (operation.kind === "initialize") {
      if (!record) {
        record = recordFromState(instance, operation.generation, true);
        writeStoredRecord(instance, record);
        return {
          record: cloneRecord(record),
          cacheGeneration: operation.generation,
          bindGeneration: true,
        };
      }
      if (record.generation === operation.generation) {
        return {
          record: cloneRecord(record),
          cacheGeneration: operation.generation,
          bindGeneration: true,
        };
      }
      if (!instance.generationBound && record.joinable) {
        return {
          record: cloneRecord(record),
          cacheGeneration: record.generation,
          bindGeneration: true,
        };
      }
      return { stale: true };
    }

    if (operation.kind === "reset") {
      if (record && record.generation !== operation.generation) {
        return { stale: true };
      }
      let event = null;
      if (record && record.status === "playing" && record.play_id) {
        if (record.time_owner && record.time_owner.document_id === documentId) {
          updateOwnedTime(record, instance, false, operation);
        }
        record.status = "reset";
        record.time_owner = null;
        event = makeOperationEvent(record, "game_reset", "reset");
      }
      const nextRecord = recordFromState(instance, operation.nextGeneration, false);
      writeStoredRecord(instance, nextRecord);
      return { record: nextRecord, cacheGeneration: operation.nextGeneration, event: event };
    }

    if (!record) {
      if (operation.kind !== "start") {
        return null;
      }
      record = recordFromState(instance, operation.generation, true);
    } else if (record.generation !== operation.generation) {
      return { stale: true };
    }

    if (operation.kind === "start") {
      if (operation.hasStage || operation.hasStep) {
        applyOperationStage(record, operation);
      }
      if (record.status === "pending") {
        record.play_id = createPlayId();
        if (!record.play_id) {
          return null;
        }
        record.status = "playing";
        record.time_owner = null;
        if (operation.visibleAt) {
          renewOrClaimTimeOwner(record, instance, operation);
        }
        const event = makeOperationEvent(record, "game_start", "playing");
        writeStoredRecord(instance, record);
        return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
      }
      if (record.status !== "playing") {
        return null;
      }
      const newlyOwned = renewOrClaimTimeOwner(record, instance, operation);
      const event = newlyOwned ? makeOperationEvent(record, "game_resume", "playing") : null;
      writeStoredRecord(instance, record);
      return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
    }

    if (record.status !== "playing") {
      return null;
    }
    if (operation.kind === "pause") {
      if (!record.time_owner || record.time_owner.document_id !== documentId) {
        return null;
      }
      updateOwnedTime(record, instance, true, operation);
      record.time_owner = null;
      const event = makeOperationEvent(record, "game_pause", "playing");
      writeStoredRecord(instance, record);
      return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
    }

    if (operation.kind === "resume") {
      const newlyOwned = renewOrClaimTimeOwner(record, instance, operation);
      if (!newlyOwned) {
        return null;
      }
      const event = makeOperationEvent(record, "game_resume", "playing");
      writeStoredRecord(instance, record);
      return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
    }

    if (operation.kind === "heartbeat") {
      const priorOwner = record.time_owner && record.time_owner.document_id;
      const newlyOwned = renewOrClaimTimeOwner(record, instance, operation);
      const ownsTime = Boolean(record.time_owner && record.time_owner.document_id === documentId);
      if (ownsTime) {
        updateOwnedTime(record, instance, false, operation);
      }
      let event = null;
      if (newlyOwned && priorOwner !== documentId) {
        event = makeOperationEvent(record, "game_resume", "playing");
      } else if (ownsTime && record.active_ms - record.last_checkpoint_active_ms >= CHECKPOINT_MS) {
        record.checkpoints += 1;
        record.last_checkpoint_active_ms = record.active_ms;
        event = makeOperationEvent(record, "game_checkpoint", "playing");
      }
      if (ownsTime || event) {
        writeStoredRecord(instance, record);
        return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
      }
      return null;
    }

    if (operation.kind === "clear" || operation.kind === "fail") {
      if (operation.hasStage || operation.hasStep) {
        applyOperationStage(record, operation);
      }
      if (record.time_owner && record.time_owner.document_id === documentId) {
        updateOwnedTime(record, instance, false, operation);
      }
      record.status = operation.kind === "clear" ? "cleared" : "failed";
      record.time_owner = null;
      const event = makeOperationEvent(
        record,
        operation.kind === "clear" ? "game_clear" : "game_fail",
        operation.kind === "clear" ? "cleared" : "failed"
      );
      writeStoredRecord(instance, record);
      return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
    }

    if (operation.hasStage || operation.hasStep) {
      applyOperationStage(record, operation);
    }
    renewOrClaimTimeOwner(record, instance, operation);
    if (record.time_owner && record.time_owner.document_id === documentId) {
      updateOwnedTime(record, instance, false, operation);
    }
    if (operation.kind === "hint") {
      record.hints += 1;
    } else if (operation.kind === "wrong") {
      record.wrong_answers += 1;
    } else if (operation.kind === "checkpoint") {
      record.checkpoints += 1;
      record.last_checkpoint_active_ms = record.active_ms;
    }
    const eventNames = {
      progress: "game_progress",
      hint: "game_hint",
      wrong: "game_wrong_answer",
      checkpoint: "game_checkpoint",
    };
    const eventName = eventNames[operation.kind];
    if (!eventName) {
      return null;
    }
    const event = makeOperationEvent(record, eventName, "playing");
    writeStoredRecord(instance, record);
    return { record: cloneRecord(record), cacheGeneration: operation.generation, event: event };
  }

  function syncInstanceFromRecord(instance, record, generation) {
    if (instance.generation !== generation) {
      return;
    }
    const state = instance.state;
    state.generation = record.generation;
    state.started = record.status !== "pending";
    state.cleared = record.status === "cleared";
    state.failed = record.status === "failed";
    state.playId = record.play_id;
    state.observationSeq = record.observation_seq;
    state.activeMs = record.active_ms;
    state.lastCheckpointActiveMs = record.last_checkpoint_active_ms;
    state.stage = record.stage;
    state.step = record.step;
    state.hints = record.hints;
    state.wrongAnswers = record.wrong_answers;
    state.checkpoints = record.checkpoints;
    instance.timeOwner = Boolean(record.time_owner && record.time_owner.document_id === documentId);
    state.timeOwner = instance.timeOwner;
    if (!instance.timeOwner || !isVisible() || state.paused) {
      instance.timeSampleAt = null;
      state.lastSampleAt = null;
    }
  }

  function dispatchCanonical(instance, event) {
    if (!event || !analyticsAllowed()) {
      return;
    }
    const gtag = ensureGtag();
    if (!gtag) {
      return;
    }
    safely(function () {
      gtag("event", event.name, eventParams(instance, event.record, event.status));
    }, undefined);
  }

  function enqueueStoredOperation(instance, operation) {
    const operationBinding = !instance.generationBound ? instance.initialBinding : null;
    const boundGeneration = operation.generation || instance.generation;
    operation.generation = boundGeneration;
    operation.binding = operationBinding;
    operation.stage = token(operation.stage);
    operation.observedAt = monotonicNow();
    operation.observedWall = wallNow();
    operation.visibleAt = isVisible();
    const queued = instance.queue
      .then(function () {
        if (!analyticsAllowed() || !instance.persistenceEnabled) {
          return null;
        }
        if (operation.binding) {
          operation.generation = operation.binding.generation;
        }
        return instance.locks.request(
          LOCK_PREFIX + instance.gameId,
          { mode: "exclusive" },
          function () {
            if (!analyticsAllowed()) {
              return null;
            }
            return applyStoredOperation(instance, operation);
          }
        );
      })
      .then(function (result) {
        if (!result) {
          return;
        }
        if (result.stale) {
          instance.stale = true;
          instance.timeOwner = false;
          instance.state.timeOwner = false;
          return;
        }
        if (result.bindGeneration && operation.binding) {
          operation.binding.generation = result.cacheGeneration;
          operation.binding.bound = true;
          if (instance.generation === boundGeneration) {
            instance.generation = result.cacheGeneration;
            instance.generationBound = true;
          }
        }
        if (result.record) {
          syncInstanceFromRecord(
            instance,
            result.record,
            result.cacheGeneration || operation.generation || boundGeneration
          );
        }
        dispatchCanonical(instance, result.event);
      });
    instance.queue = queued.catch(function () {
      instance.persistenceEnabled = false;
      instance.timeOwner = false;
      instance.state.timeOwner = false;
    });
    return instance.queue;
  }

  function emitCanonical(instance, eventName, status, position) {
    const state = instance.state;
    if (instance.persistenceEnabled) {
      const kinds = {
        game_start: "start",
        game_progress: "progress",
        game_hint: "hint",
        game_wrong_answer: "wrong",
        game_checkpoint: "checkpoint",
        game_pause: "pause",
        game_resume: "resume",
        game_clear: "clear",
        game_fail: "fail",
      };
      const kind = kinds[eventName];
      if (!kind) {
        return false;
      }
      enqueueStoredOperation(instance, {
        kind: kind,
        status: status,
        generation: instance.generation,
        stage: state.stage,
        step: state.step,
        hasStage: Boolean(position && position.hasStage),
        hasStep: Boolean(position && position.hasStep),
        finalSample: kind === "pause",
      });
      return true;
    }
    if (analyticsEligibleAtLoad) {
      return false;
    }
    if (!state.playId) {
      state.playId = createPlayId();
    }
    if (!state.playId || !Number.isSafeInteger(state.observationSeq + 1)) {
      return false;
    }
    state.observationSeq += 1;
    return false;
  }

  function stopHeartbeat() {
    if (heartbeat === null) {
      return;
    }
    safely(function () {
      if (typeof root.clearTimeout === "function") {
        root.clearTimeout(heartbeat);
      }
    }, undefined);
    heartbeat = null;
    heartbeatOwner = null;
  }

  function canRun(instance) {
    return (
      activeInstance === instance &&
      instance.state.started &&
      !instance.state.cleared &&
      !instance.state.failed &&
      !instance.state.paused &&
      isVisible()
    );
  }

  function scheduleHeartbeat(instance) {
    stopHeartbeat();
    if (!root.document || !canRun(instance) || typeof root.setTimeout !== "function") {
      return;
    }
    heartbeatOwner = instance;
    heartbeat = safely(function () {
      return root.setTimeout(function () {
        heartbeat = null;
        const owner = heartbeatOwner;
        heartbeatOwner = null;
        if (!owner || !canRun(owner)) {
          if (
            owner &&
            activeInstance === owner &&
            owner.state.started &&
            !owner.state.cleared &&
            !owner.state.failed &&
            !isVisible()
          ) {
            pauseInstance(owner);
          }
          return;
        }
        if (owner.persistenceEnabled) {
          enqueueStoredOperation(owner, {
            kind: "heartbeat",
            generation: owner.generation,
            stage: owner.state.stage,
            step: owner.state.step,
          });
        } else if (!analyticsEligibleAtLoad) {
          sampleActiveTime(owner.state);
          if (owner.state.activeMs - owner.state.lastCheckpointActiveMs >= CHECKPOINT_MS) {
            owner.state.checkpoints += 1;
            owner.state.lastCheckpointActiveMs = owner.state.activeMs;
            emitCanonical(owner, "game_checkpoint", "playing");
          }
        }
        scheduleHeartbeat(owner);
      }, OWNER_HEARTBEAT_MS);
    }, null);
    if (heartbeat === null) {
      heartbeatOwner = null;
    }
  }

  function pauseInstance(instance) {
    if (activeInstance !== instance) {
      return false;
    }
    const state = instance.state;
    if (!state.started || state.cleared || state.failed || state.paused) {
      return false;
    }
    // The visibility flag has already changed when visibilitychange fires, but
    // the interval up to that edge was visible and belongs in active time.
    if (!instance.persistenceEnabled) {
      sampleActiveTime(state, true);
    }
    state.paused = true;
    if (!instance.persistenceEnabled) {
      state.lastSampleAt = null;
    }
    stopHeartbeat();
    emitCanonical(instance, "game_pause", "playing");
    return true;
  }

  function resumeInstance(instance) {
    if (activeInstance !== instance) {
      return false;
    }
    const state = instance.state;
    if (!state.started || state.cleared || state.failed || !state.paused || !isVisible()) {
      return false;
    }
    state.paused = false;
    state.resumeArmed = true;
    if (!instance.persistenceEnabled) {
      state.timeOwner = true;
      instance.timeOwner = true;
      state.lastSampleAt = monotonicNow();
    }
    emitCanonical(instance, "game_resume", "playing");
    scheduleHeartbeat(instance);
    return true;
  }

  function applyStageStep(state, data) {
    if (!data || (typeof data !== "object" && typeof data !== "function")) {
      return;
    }
    safely(function () {
      const stage = token(data.stage);
      if (stage) {
        state.stage = stage;
      }
      const step = data.step;
      if (typeof step === "number" && Number.isFinite(step) && step >= 0) {
        state.step = Math.min(MAX_STEP, Math.floor(step));
      }
    }, undefined);
  }

  function positionFlags(data) {
    return safely(
      function () {
        if (!data || typeof data !== "object") {
          return { hasStage: false, hasStep: false };
        }
        return {
          hasStage: Boolean(token(data.stage)),
          hasStep: typeof data.step === "number" && Number.isFinite(data.step) && data.step >= 0,
        };
      },
      { hasStage: false, hasStep: false }
    );
  }

  function payloadFromArgs(stage, step, generation) {
    const payload = {};
    if (stage && typeof stage === "object") {
      payload.stage = stage.stage;
      payload.step = stage.step;
      if (stage.generation !== undefined) {
        payload.generation = stage.generation;
      }
    } else if (typeof stage === "string") {
      payload.stage = stage;
    }
    if (typeof step === "number") {
      payload.step = step;
    }
    if (generation !== undefined) {
      payload.generation = generation;
    }
    return payload;
  }

  function startInstance(instance, data) {
    if (activeInstance !== instance) {
      return false;
    }
    if (data && data.generation !== undefined && token(data.generation) !== instance.generation) {
      return false;
    }
    const state = instance.state;
    applyStageStep(state, data);
    if (state.cleared || state.failed) {
      return false;
    }
    if (state.started) {
      state.resumeArmed = true;
      return state.paused ? resumeInstance(instance) : false;
    }
    state.started = true;
    state.paused = !isVisible();
    state.resumeArmed = true;
    if (!instance.persistenceEnabled) {
      state.timeOwner = true;
      instance.timeOwner = true;
      state.lastSampleAt = state.paused ? null : monotonicNow();
    }
    state.lastCheckpointActiveMs = state.activeMs;
    emitCanonical(instance, "game_start", "playing", positionFlags(data));
    scheduleHeartbeat(instance);
    return true;
  }

  function restartInstance(instance, data) {
    if (activeInstance !== instance) {
      return false;
    }
    if (data && data.generation !== undefined && token(data.generation) !== instance.generation) {
      return false;
    }
    resetInstance(instance);
    applyStageStep(instance.state, data);
    return startInstance(instance, data);
  }

  function resetInstance(instance) {
    if (activeInstance !== instance) {
      return false;
    }
    const oldState = instance.state;
    const oldGeneration = instance.generation;
    const nextGeneration = createPlayId();
    if (!nextGeneration) {
      return false;
    }
    stopHeartbeat();
    instance.generation = nextGeneration;
    instance.generationBound = true;
    instance.state = freshState();
    instance.state.generation = nextGeneration;
    if (instance.persistenceEnabled) {
      enqueueStoredOperation(instance, {
        kind: "reset",
        generation: oldGeneration,
        nextGeneration: nextGeneration,
        stage: oldState.stage,
        step: oldState.step,
      });
    } else if (
      !analyticsEligibleAtLoad &&
      oldState.started &&
      !oldState.cleared &&
      !oldState.failed
    ) {
      if (!oldState.playId) {
        oldState.playId = createPlayId();
      }
      if (oldState.playId && Number.isSafeInteger(oldState.observationSeq + 1)) {
        oldState.observationSeq += 1;
      }
    }
    return true;
  }

  function trackInstance(instance, type, data) {
    if (activeInstance !== instance || typeof type !== "string") {
      return false;
    }
    if (
      data &&
      typeof data === "object" &&
      Object.prototype.hasOwnProperty.call(data, "generation")
    ) {
      const generation = token(data.generation);
      if (!generation || generation !== instance.generation) {
        return false;
      }
    }
    if (!Object.prototype.hasOwnProperty.call(TYPE_MAP, type)) {
      return false;
    }
    const eventType = TYPE_MAP[type];
    applyStageStep(instance.state, data);
    const state = instance.state;

    if (eventType === "start") {
      return startInstance(instance, data);
    }
    if (eventType === "restart") {
      return restartInstance(instance, data);
    }
    if (eventType === "reset") {
      return resetInstance(instance);
    }
    if (eventType === "pause") {
      return pauseInstance(instance);
    }
    if (eventType === "resume") {
      state.resumeArmed = true;
      return resumeInstance(instance);
    }

    if (eventType === "clear" || eventType === "fail") {
      if (!state.started || state.cleared || state.failed) {
        return false;
      }
      if (!instance.persistenceEnabled && !state.paused && isVisible()) {
        sampleActiveTime(state);
      }
      state.cleared = eventType === "clear";
      state.failed = eventType === "fail";
      state.paused = false;
      if (!instance.persistenceEnabled) {
        state.lastSampleAt = null;
        state.timeOwner = false;
      }
      stopHeartbeat();
      emitCanonical(
        instance,
        eventType === "clear" ? "game_clear" : "game_fail",
        eventType === "clear" ? "cleared" : "failed",
        positionFlags(data)
      );
      return true;
    }

    if (eventType === "progress" && !state.started) {
      return false;
    }
    if (!state.started || state.cleared || state.failed || state.paused) {
      return false;
    }

    if (!instance.persistenceEnabled) {
      sampleActiveTime(state);
    }
    if (eventType === "progress") {
      emitCanonical(instance, "game_progress", "playing", positionFlags(data));
    } else if (eventType === "hint") {
      state.hints += 1;
      emitCanonical(instance, "game_hint", "playing", positionFlags(data));
    } else if (eventType === "wrong") {
      state.wrongAnswers += 1;
      emitCanonical(instance, "game_wrong_answer", "playing", positionFlags(data));
    } else if (eventType === "checkpoint") {
      state.checkpoints += 1;
      state.lastCheckpointActiveMs = state.activeMs;
      emitCanonical(instance, "game_checkpoint", "playing", positionFlags(data));
    }
    if (eventType === "checkpoint") {
      scheduleHeartbeat(instance);
    }
    return true;
  }

  const TYPE_MAP = {
    start: "start",
    game_start: "start",
    progress: "progress",
    game_progress: "progress",
    clear: "clear",
    game_clear: "clear",
    fail: "fail",
    game_fail: "fail",
    hint: "hint",
    game_hint: "hint",
    wrong: "wrong",
    wrong_answer: "wrong",
    game_wrong_answer: "wrong",
    restart: "restart",
    reset: "reset",
    game_reset: "reset",
    checkpoint: "checkpoint",
    game_checkpoint: "checkpoint",
    pause: "pause",
    game_pause: "pause",
    resume: "resume",
    game_resume: "resume",
  };

  function snapshotInstance(instance) {
    const state = instance.state;
    if (activeInstance === instance && !instance.persistenceEnabled) {
      sampleActiveTime(state);
    }
    const seconds = activeSeconds(state);
    return {
      gameId: instance.gameId,
      revision: instance.revision || null,
      generation: instance.generation,
      started: state.started,
      cleared: state.cleared,
      failed: state.failed,
      play_id: state.playId,
      observation_seq: state.observationSeq,
      paused: state.started && !state.cleared && state.paused,
      play_status: state.cleared
        ? "cleared"
        : state.failed
          ? "failed"
          : state.started
            ? "playing"
            : "not_started",
      stage: token(state.stage) || "playing",
      step: Number.isInteger(state.step) && state.step >= 0 ? state.step : 0,
      active_seconds: seconds,
      elapsed_bucket: elapsedBucket(seconds),
      hint_count: state.hints,
      wrong_count: state.wrongAnswers,
      checkpoint_count: state.checkpoints,
    };
  }

  function invoke(instance, fn, fallback) {
    return safely(function () {
      return fn(instance);
    }, fallback);
  }

  const NOOP_INSTANCE = {
    track: function () {
      return false;
    },
    start: function () {
      return false;
    },
    progress: function () {
      return false;
    },
    clear: function () {
      return false;
    },
    fail: function () {
      return false;
    },
    hint: function () {
      return false;
    },
    wrong: function () {
      return false;
    },
    restart: function () {
      return false;
    },
    reset: function () {
      return false;
    },
    checkpoint: function () {
      return false;
    },
    snapshot: function () {
      return null;
    },
    flush: function () {
      return Promise.resolve();
    },
  };

  function makeInstance(gameId, revision, state, persistence) {
    const instance = {
      gameId: gameId,
      revision: revision,
      state: state,
      generation: state.generation,
      generationBound: Boolean(persistence.record),
      initialBinding: {
        generation: state.generation,
        bound: Boolean(persistence.record),
      },
      persistenceEnabled: persistence.enabled,
      storage: persistence.storage || null,
      locks: persistence.locks || null,
      queue: Promise.resolve(),
      timeOwner: false,
      timeSampleAt: null,
      pageViewed: false,
      api: null,
    };
    instance.api = {
      gameId: gameId,
      track: function (type, data) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, type, data);
          },
          false
        );
      },
      start: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return startInstance(item, payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      progress: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, "progress", payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      clear: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, "clear", payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      fail: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, "fail", payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      hint: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, "hint", payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      wrong: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, "wrong", payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      restart: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return restartInstance(item, payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      reset: function () {
        return invoke(instance, resetInstance, false);
      },
      checkpoint: function (stage, step, generation) {
        return invoke(
          instance,
          function (item) {
            return trackInstance(item, "checkpoint", payloadFromArgs(stage, step, generation));
          },
          false
        );
      },
      snapshot: function () {
        return invoke(instance, snapshotInstance, null);
      },
      flush: function () {
        return instance.queue;
      },
    };
    return instance;
  }

  function activate(instance) {
    if (activeInstance === instance) {
      if (
        instance.state.started &&
        !instance.state.cleared &&
        !instance.state.failed &&
        instance.state.paused &&
        isVisible()
      ) {
        resumeInstance(instance);
      }
      return;
    }
    if (activeInstance) {
      pauseInstance(activeInstance);
    }
    stopHeartbeat();
    activeInstance = instance;
    if (
      instance.state.started &&
      !instance.state.cleared &&
      !instance.state.failed &&
      instance.state.paused &&
      isVisible()
    ) {
      resumeInstance(instance);
    }
  }

  function validOptions(options) {
    return safely(function () {
      return options && typeof options === "object" ? options : {};
    }, {});
  }

  function init(options) {
    return safely(function () {
      options = validOptions(options);
      const gameId = token(options.gameId);
      if (!gameId) {
        return NOOP_INSTANCE;
      }
      const revision = token(options.revision);
      let instance = instanceByGame[gameId];
      if (!instance) {
        const persistence = persistentContext(gameId);
        const state = persistence.record ? stateFromRecord(persistence.record) : freshState();
        instance = makeInstance(gameId, revision, state, persistence);
        instanceByGame[gameId] = instance;
        if (persistence.enabled && !persistence.record) {
          enqueueStoredOperation(instance, {
            kind: "initialize",
            generation: state.generation,
            stage: state.stage,
            step: state.step,
          });
        }
      } else if (!instance.revision && revision) {
        instance.revision = revision;
      }
      activate(instance);
      sendPageView(instance);
      return instance.api;
    }, NOOP_INSTANCE);
  }

  function current(method, args) {
    if (!activeInstance || !activeInstance.api) {
      return false;
    }
    return safely(function () {
      return activeInstance.api[method].apply(activeInstance.api, args || []);
    }, false);
  }

  const publicApi = {
    init: init,
    track: function (type, data) {
      return current("track", [type, data]);
    },
    start: function (stage, step, generation) {
      return current("start", [stage, step, generation]);
    },
    progress: function (stage, step, generation) {
      return current("progress", [stage, step, generation]);
    },
    clear: function (stage, step, generation) {
      return current("clear", [stage, step, generation]);
    },
    fail: function (stage, step, generation) {
      return current("fail", [stage, step, generation]);
    },
    hint: function (stage, step, generation) {
      return current("hint", [stage, step, generation]);
    },
    wrong: function (stage, step, generation) {
      return current("wrong", [stage, step, generation]);
    },
    restart: function (stage, step, generation) {
      return current("restart", [stage, step, generation]);
    },
    reset: function () {
      return current("reset", []);
    },
    checkpoint: function (stage, step, generation) {
      return current("checkpoint", [stage, step, generation]);
    },
    snapshot: function () {
      return current("snapshot", []);
    },
    flush: function () {
      return current("flush", []) || Promise.resolve();
    },
  };

  function onGameEvent(event) {
    safely(function () {
      const detail = event && event.detail;
      if (!detail || typeof detail !== "object" || typeof detail.type !== "string") {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(TYPE_MAP, detail.type)) {
        return;
      }
      let instanceApi;
      if (detail.gameId !== undefined) {
        const gameId = token(detail.gameId);
        if (!gameId) {
          return;
        }
        instanceApi = init({ gameId: gameId, revision: detail.revision });
      } else if (activeInstance) {
        instanceApi = activeInstance.api;
      } else {
        return;
      }
      if (instanceApi && typeof instanceApi.track === "function") {
        const payload = {
          stage: detail.stage,
          step: detail.step,
        };
        if (detail.generation !== undefined) {
          payload.generation = detail.generation;
        }
        instanceApi.track(detail.type, payload);
      }
    }, undefined);
  }

  function onVisibilityChange() {
    safely(function () {
      const instance = activeInstance;
      if (!instance || !instance.state.started || instance.state.cleared) {
        return;
      }
      if (!isVisible()) {
        pauseInstance(instance);
      } else if (instance.state.resumeArmed) {
        resumeInstance(instance);
      }
    }, undefined);
  }

  function onPageHide() {
    safely(function () {
      if (activeInstance) {
        pauseInstance(activeInstance);
      }
    }, undefined);
  }

  function onPageShow(event) {
    safely(function () {
      if (!event || event.persisted !== true) {
        return;
      }
      const instance = activeInstance;
      if (instance && instance.state.resumeArmed) {
        resumeInstance(instance);
      }
    }, undefined);
  }

  safely(function () {
    analyticsEligibleAtLoad = currentAnalyticsContextAllowed();
  }, undefined);

  safely(function () {
    if (typeof root.addEventListener === "function") {
      root.addEventListener("akashic:game", onGameEvent);
    }
  }, undefined);
  safely(function () {
    if (typeof root.addEventListener === "function") {
      root.addEventListener("pagehide", onPageHide);
    }
  }, undefined);
  safely(function () {
    if (typeof root.addEventListener === "function") {
      root.addEventListener("pageshow", onPageShow);
    }
  }, undefined);
  safely(function () {
    if (root.document && typeof root.document.addEventListener === "function") {
      root.document.addEventListener("visibilitychange", onVisibilityChange);
    }
  }, undefined);
  safely(function () {
    root.AkashicTelemetry = publicApi;
  }, undefined);

  safely(function () {
    if (typeof module === "object" && module.exports) {
      module.exports = publicApi;
    }
  }, undefined);
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
