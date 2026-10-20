"""Playwright smoke checks for the conversation-first game and guarded live mode."""
import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
QA = Path(tempfile.mkdtemp(prefix="hon-lion-browser-qa-"))
THEORY = "洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。"
PROLOGUE_COPY = [
    "最近仕事から帰ったらASMRを聴くことが習慣になっている。\nベッドに横たわって、サリサリ、トントンって音を聞くのがすごく気持ちいい。",
    "日頃のストレスが消えていくようだ。\nうっかり寝落ちしていることもよくあり、この日もASMRを聴きながら眠りについた。",
    "そして目を覚ますと、見知らぬ洋館に1人佇んでいた。",
]
OPENING_COPY = "不思議なことにさっきまで聴いていたASMRは同じように聞こえている。でもそれは耳のイヤホンからではなく、洋館の奥の廊下からだ…。"
DISCOVERY_COPY = "目の前には奇妙な本型のライオン？がいる。\nここは一体どこなんだ！？"
GREETING_COPY = "ぼく、ほんらいおん。なにをきかれても「はい」「いいえ」「関係ない」でこたえることができるんだ！なんでもきいてね！"
PROBLEM_COPY = "この洋館と、聞こえ続ける音の正体は何か。\nあなたの身に何が起きているのかも含めて、状況を説明してください。"

async def advance_intro(page):
    for _ in range(len(PROLOGUE_COPY) + 1):
        if await page.locator("#app").get_attribute("data-phase") == "question":
            break
        await page.get_by_role("button", name="次へ").click()
    if await page.locator("#app").get_attribute("data-phase") == "problem":
        assert await page.locator("#conversation-log").text_content() == PROBLEM_COPY
        await page.get_by_role("button", name="推理をはじめる", exact=True).click()
    assert await page.locator("#app").get_attribute("data-phase") == "question"

async def assert_readable(page):
    geometry = await page.locator("#conversation-log").evaluate("""el => {
        const r=el.getBoundingClientRect();
        const action=document.querySelector('.advance-action')?.getBoundingClientRect();
        return {fits:el.scrollHeight<=el.clientHeight+1, top:r.top, bottom:r.bottom,
            actionVisible:!action||(action.top>=0&&action.bottom<=innerHeight)};
    }""")
    assert geometry["fits"] and geometry["top"] >= 0 and geometry["actionVisible"], geometry
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")

async def wait_scene(page, stage=None):
    await page.wait_for_function("() => Boolean(window.__HON_LION_SCENE__?.snapshot?.().ready)", timeout=180000)
    if stage is not None:
        await page.wait_for_function("(expected) => { const s = window.__HON_LION_SCENE__.snapshot(); return s.appliedStage === expected && s.context === 'active'; }", arg=stage, timeout=180000)
    snapshot = await page.evaluate("window.__HON_LION_SCENE__.snapshot()")
    assert snapshot["media"]["kind"] == "video", snapshot
    return snapshot

async def install_procedure_test_double(page, manual=False):
    """Test-only ACKs, not production cut assignments or evidence of new media."""
    await page.wait_for_function("Boolean(window.__HON_LION_SCENE_RUNTIME__)")
    await page.evaluate("""manual => {
        const original=window.__HON_LION_SCENE_RUNTIME__;
        window.__TEST_STEP_CALLS__=[];
        window.__TEST_STEP_RELEASES__={};
        window.__HON_LION_SCENE_RUNTIME__=Object.freeze({...original,runCheckpointStep:async(id,{signal})=>{
            window.__TEST_STEP_CALLS__.push(id);
            if(manual)return new Promise(resolve=>{window.__TEST_STEP_RELEASES__[id]=resolve;});
            // Only the legacy two clips are real media. Remaining ACKs are mocked.
            const result=id==='step1'?await original.setStage(1,'living'):
                id==='step2'?await original.setStage(2,'close'):{};
            return {...result,completed:!signal.aborted&&!result.cancelled,cancelled:signal.aborted||result.cancelled};
        }});
    }""", manual)

async def start_demo(page, static_url, wait_for_scene=True, procedure_fixture=True):
    # Keep offline UI fixtures deterministic even when a real key is configured.
    await page.route("**/api/hon-lion/status*", lambda route: route.fulfill(status=200, content_type="application/json", body='{"configured":false}'))
    await page.goto(static_url + "?demo=1", wait_until="domcontentloaded")
    initial_scene = await wait_scene(page, 0) if wait_for_scene else None
    if procedure_fixture:
        await install_procedure_test_double(page)
    assert await page.locator("#scene-video").is_hidden()
    if wait_for_scene:
        assert initial_scene["currentNode"] == "a"
    await page.get_by_role("button", name="はじめる").click()
    revision = await page.evaluate("""async () => {
        const checkpoint = await fetch('./assets/video/checkpoint-manifest.json');
        const manifest = checkpoint.ok ? await checkpoint.json()
            : await fetch('./assets/video/video-manifest.json').then(r => r.json());
        return manifest.asset_revision || '';
    }""")
    if revision:
        await page.wait_for_function("(v) => document.querySelector('#scene-poster').src.includes('v=' + v)", arg=revision)
    assert await page.locator("#demo-badge").count() == 0
    assert await page.locator("#interaction-rail").count() == 0
    assert await page.locator("#inventory-key").count() == 0
    assert await page.locator("#mode-toggle").count() == 0
    assert await page.locator("#reset-button").count() == 0
    await advance_intro(page)
    assert await page.locator("#question-form").is_hidden()

async def intro_greeting(browser, static_url):
    for viewport, keyboard, intro_path, greeting_path in ((
        ({"width":1280,"height":720}, False, "intro-desktop.png", "lion-greeting-desktop.png"),
        ({"width":390,"height":600}, True, "intro-mobile-390x600.png", "lion-greeting-mobile-390x600.png"),
        ({"width":320,"height":568}, False, "intro-mobile-320x568.png", "lion-greeting-mobile-320x568.png"),
    )):
        page = await browser.new_page(viewport=viewport)
        await page.route("**/api/hon-lion/status*", lambda route: route.fulfill(status=200, content_type="application/json", body='{"configured":true}'))
        errors=[]; console_errors=[]
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        requests=[]
        page.on("request", lambda request: requests.append(request.url))
        await page.goto(static_url + "?demo=1", wait_until="domcontentloaded")
        assert await page.title() == "水平思考ゲーム"
        assert page.url == static_url + "?demo=1"
        await wait_scene(page, 0)
        assert await page.locator(".scene-background").is_hidden()
        await page.get_by_role("button", name="はじめる").click()
        log = page.locator("#conversation-log")
        for index, expected in enumerate(PROLOGUE_COPY):
            assert await page.locator("#app").get_attribute("data-phase") == "prologue"
            assert await log.text_content() == expected
            assert await page.locator(".scene-background").is_hidden()
            assert await page.locator("#lion-character-button").is_hidden()
            assert await page.locator("#conversation-tools").is_hidden()
            await assert_readable(page)
            await page.screenshot(path=str(QA / f"prologue-{index}-{viewport['width']}x{viewport['height']}.png"), animations="disabled")
            await page.get_by_role("button", name="次へ").click()
        text = await log.text_content()
        assert OPENING_COPY in text and "屋敷の夜は" not in text
        assert await page.locator(".scene-background").is_visible()
        assert await page.locator("#lion-character-button").is_visible()
        await page.locator("#scene-poster").evaluate("image => image.decode()")
        assert await page.locator("#scene-poster").evaluate("image => image.naturalWidth > 0 && getComputedStyle(image).opacity === '1'")
        await assert_readable(page)
        assert await page.locator("#lion-character-button").get_attribute("aria-label") == "本ライオンに話しかける"
        assert await page.locator("#lion-character-button").is_disabled()
        await page.screenshot(path=str(QA / intro_path), full_page=True, animations="disabled")
        await page.get_by_role("button", name="次へ").click()
        assert await page.locator("#app").get_attribute("data-phase") == "problem"
        assert await page.locator("#conversation-log").text_content() == PROBLEM_COPY
        assert await page.locator("#lion-character-button").is_disabled()
        await assert_readable(page)
        await page.screenshot(path=str(QA / f"problem-{viewport['width']}x{viewport['height']}.png"), animations="disabled")
        await page.get_by_role("button", name="推理をはじめる", exact=True).click()
        assert await page.locator(".message.narration:not([hidden])").text_content() == DISCOVERY_COPY
        assert await page.locator("#conversation-tools").is_visible()
        assert await page.locator("#lion-character-button").is_enabled()
        await assert_readable(page)
        if keyboard:
            await page.locator("#lion-character-button").focus()
            await page.keyboard.press("Enter")
        else:
            await page.locator("#lion-character-button").click()
        await page.wait_for_function("expected => document.querySelectorAll('.message.lion').length === 1 && document.querySelector('.message.lion').textContent === expected", arg=GREETING_COPY)
        assert await page.locator(".message.lion").count() == 1
        assert await page.locator(".message.lion").text_content() == GREETING_COPY
        assert await page.locator("#app").get_attribute("data-reasoning-stage") == "0"
        assert await page.locator("img[src*='key.png']").count() == 0
        await page.screenshot(path=str(QA / greeting_path), full_page=True, animations="disabled")
        await page.locator("#lion-character-button").click()
        await page.wait_for_timeout(100)
        assert await page.locator(".message.lion").count() == 1
        await page.locator("#ask-toggle").click()
        assert await page.locator("#question-form").is_visible()
        await page.locator("#composer-cancel").click()
        # Restoring a cached page returns to the dark start and the first sentence.
        await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        assert await page.locator(".scene-background").is_hidden()
        await page.get_by_role("button", name="はじめる").click()
        assert await log.text_content() == PROLOGUE_COPY[0]
        assert await page.locator("#lion-character-button").is_hidden()
        assert not any("/api/hon-lion/chat" in url for url in requests)
        assert not errors, errors
        assert not console_errors, console_errors
        await page.close()


async def ask(page, question, expected):
    await page.locator("#ask-toggle").click()
    await page.locator("#question-input").fill(question)
    await page.locator("#question-send").click()
    await page.locator(".message.lion:not([hidden])").wait_for(state="visible")
    assert await page.locator(".message.lion:not([hidden])").text_content() == expected
    assert await page.locator("#question-form").is_hidden()


async def assert_transition_started(page, target_stage, clip):
    handle = await page.wait_for_function("""(expected) => {
        const s = window.__HON_LION_SCENE__.snapshot();
        return s.requestedStage === expected.stage && s.media.clip === expected.clip ? s : false;
    }""", arg={"stage":target_stage,"clip":clip}, timeout=5000)
    snapshot = await handle.json_value()
    assert snapshot["media"]["clip"] == clip, snapshot
    revision = await page.evaluate("fetch('./assets/video/video-manifest.json').then(r => r.json()).then(m => m.asset_revision || '')")
    if revision:
        await page.wait_for_function("(v) => document.querySelector('#scene-video').currentSrc.includes('v=' + v)", arg=revision)
    await page.wait_for_function("(expected) => { const s = window.__HON_LION_SCENE__.snapshot(); return s.media.clip === expected && s.media.currentTime > 0; }", arg=clip, timeout=15000)
    return snapshot

async def wait_visual_node(page, node):
    await page.wait_for_function("(expected) => { const s = window.__HON_LION_SCENE__.snapshot(); return s.currentNode === expected && !s.media.playing; }", arg=node, timeout=180000)
    snapshot = await page.evaluate("window.__HON_LION_SCENE__.snapshot()")
    assert snapshot["error"] is None, snapshot
    assert snapshot["media"]["clip"] is not None, snapshot
    assert abs(snapshot["media"]["currentTime"] - snapshot["media"]["duration"]) < .02, snapshot


async def wait_reward_node(page, node):
    """Wait for a reward route node, allowing a poster fallback on asset failure."""
    await page.wait_for_function("(expected) => { const s = window.__HON_LION_SCENE__.snapshot(); return s.currentNode === expected && !s.media.playing; }", arg=node, timeout=180000)
    snapshot = await page.evaluate("window.__HON_LION_SCENE__.snapshot()")
    assert snapshot["currentNode"] == node, snapshot


async def assert_reward_visible(page, image_part, label_text):
    image = page.locator(f"img[src*='{image_part}']").last
    label = page.get_by_text(label_text, exact=True).last
    assert await image.count() == 1
    assert await label.count() == 1
    await page.wait_for_function("(selector) => { const el = document.querySelector(selector); return Boolean(el && el.complete && el.naturalWidth > 0); }", arg=f"img[src*=\"{image_part}\"]")
    info = await image.evaluate("""(el) => {
        const r = el.getBoundingClientRect();
        const scroller = el.closest('.conversation-log').getBoundingClientRect();
        const text = el.parentElement.querySelector('strong').getBoundingClientRect();
        return {naturalWidth: el.naturalWidth, imageVisible: r.top >= scroller.top && r.bottom <= scroller.bottom && r.left >= scroller.left && r.right <= scroller.right, labelVisible: text.top >= scroller.top && text.bottom <= scroller.bottom, screenVisible: r.top >= 0 && r.bottom <= innerHeight};
    }""")
    assert info["naturalWidth"] > 0, info
    assert info["imageVisible"] and info["labelVisible"] and info["screenVisible"], info

CHECKPOINT_SEGMENTS = {
    "step1": [("hall-entrance", "次へ")],
    "step2": [("entrance-rear-door", "次へ")],
    "step3": [("rear-door-cross", None), ("cross-key", "戸棚の鍵を拾う")],
    "step4": [("key-cabinet", "戸棚を開ける"), ("cabinet-open", "光線銃を取る"), ("cabinet-take", "次へ"), ("cabinet-stow", "十字の鍵を取る"), ("cabinet-door-key", None)],
    "step5": [("cabinet-rear-door", "次へ")],
}

async def configure_production_checkpoint_media(page):
    manifest = await page.evaluate("fetch('./assets/video/checkpoint-manifest.json', {cache:'no-store'}).then(async r => ({ok:r.ok, body:r.ok ? await r.json() : null}))")
    assert manifest["ok"], "checkpoint-manifest.json is required for the production-media suite"
    body = manifest["body"]
    assert body.get("schema") == "hon-lion-checkpoint-media-v1", body
    assert body.get("source_scene_sha256") == "6c2c34a3816c501d58e307d0f4e171fb39e4aee97aab89c0879e9b64e815035d", body
    assert len(body.get("asset_revision", "")) == 64, body
    for key in [segment[0] for segments in CHECKPOINT_SEGMENTS.values() for segment in segments] + ["rear-door-open"]:
        assert key in body.get("clips", {}), key
    await page.locator("#scene-video").evaluate("""video => {
        video.defaultPlaybackRate=4;
        video.playbackRate=4;
        video.addEventListener('loadedmetadata',()=>{video.playbackRate=4;});
    }""")

async def wait_for_production_clip(page, clip):
    await page.wait_for_function("key => window.__HON_LION_SCENE__.snapshot().media.clip === key", arg=clip, timeout=180000)
    await page.wait_for_function("key => { const video=document.querySelector('#scene-video'); return video.currentSrc.includes('checkpoint-' + key + '-') && video.duration > 0 && video.currentTime > 0; }", arg=clip, timeout=180000)
    snapshot = await page.evaluate("window.__HON_LION_SCENE__.snapshot()")
    assert snapshot["media"]["clip"] == clip and snapshot["media"]["duration"] > 0, snapshot
    if clip in ("entrance-rear-door", "rear-door-cross", "cabinet-rear-door"):
        assert snapshot["media"]["duration"] > 5, snapshot

async def complete_production_steps(page, step_ids=("step1", "step2", "step3", "step4", "step5")):
    """Use actual MP4 playback and visible production controls, never mocked ACKs."""
    for step_id in step_ids:
        for clip, action in CHECKPOINT_SEGMENTS[step_id]:
            await wait_for_production_clip(page, clip)
            print(f"checkpoint media: {step_id} / {clip}", flush=True)
            if action:
                await page.get_by_role("button", name=action, exact=True).click(timeout=30000)
        await page.wait_for_function("step => window.__HON_LION_CHECKPOINTS__.snapshot().completedStepIds.includes(step)", arg=step_id, timeout=180000)

async def complete_real_procedures(page):
    await page.wait_for_function("window.__HON_LION_CHECKPOINTS__.snapshot().queuedStepIds.length > 0")
    await configure_production_checkpoint_media(page)
    await complete_production_steps(page)
    await page.wait_for_function("window.__HON_LION_CHECKPOINTS__.snapshot().completedStepIds.length === 5")

async def full_demo(page, static_url):
    print("smoke: production checkpoint manifest traversal", flush=True)
    await start_demo(page, static_url, procedure_fixture=False)
    await page.screenshot(path=str(QA / "conversation-desktop.png"), full_page=True)
    await ask(page, "生き物ですか？", "関係ない")
    await page.locator("#theory-toggle").click()
    await page.locator("#question-input").fill(THEORY)
    await page.locator("#question-send").click()
    assert await page.locator(".message.lion").last.text_content() == "はい"
    await page.locator("#question-form").wait_for(state="hidden")
    await complete_real_procedures(page)
    assert await page.locator("#app").get_attribute("data-phase") == "entrance"
    assert await page.locator("img[src*='key.png']").count() == 0
    await page.get_by_role("button", name="部屋の鍵でドアを開ける", exact=True).click()
    await page.locator(".bug-mark").wait_for(state="visible", timeout=15000)
    assert await page.locator("#app").get_attribute("data-scene") == "bug"
    await page.screenshot(path=str(QA / "entrance-final.png"), full_page=True)
    await page.get_by_role("button", name="光線銃を撃つ", exact=True).click()
    await page.locator(".clear-message").wait_for(state="visible", timeout=10000)
    assert await page.locator("#app").get_attribute("data-scene") == "clear"
    assert await page.locator(".bug-mark").count() == 0
    assert await page.locator(".beam").count() == 0
    await page.screenshot(path=str(QA / "clear.png"), full_page=True)
    await page.get_by_role("button", name="もう一度", exact=True).click()
    assert await page.locator("#app").get_attribute("data-phase") == "start"



async def mobile_rewards(browser, static_url):
    print("smoke: mobile checkpoint media visibility", flush=True)
    page = await browser.new_page(viewport={"width":390,"height":590})
    await start_demo(page, static_url, wait_for_scene=False, procedure_fixture=False)
    await page.locator("#theory-toggle").click()
    await page.locator("#question-input").fill(THEORY)
    await page.locator("#question-send").click()
    await complete_real_procedures(page)
    assert await page.locator("#app").get_attribute("data-phase") == "entrance"
    assert await page.locator("#app").get_attribute("data-reward-busy") == "false"
    await page.screenshot(path=str(QA / "checkpoint-ready-mobile-390x590.png"), full_page=True)
    await page.close()

async def production_checkpoint_media(browser, static_url):
    """Release gate for the captured checkpoint media, run only once files exist."""
    print("smoke: actual checkpoint media on desktop and mobile", flush=True)
    desktop = await browser.new_page(viewport={"width":1280,"height":720})
    errors=[]
    desktop.on("pageerror", lambda error: errors.append(str(error)))
    await start_demo(desktop, static_url, procedure_fixture=False)
    await configure_production_checkpoint_media(desktop)
    await desktop.locator("#theory-toggle").click()
    await desktop.locator("#question-input").fill(THEORY)
    await desktop.locator("#question-send").click()
    assert await desktop.locator(".message.lion").last.text_content() == "はい"
    await complete_production_steps(desktop)
    assert await desktop.locator("#app").get_attribute("data-phase") == "entrance"
    await desktop.screenshot(path=str(QA / "checkpoint-production-desktop-ready.png"), full_page=True, animations="disabled")
    await desktop.get_by_role("button", name="部屋の鍵でドアを開ける", exact=True).click()
    await wait_for_production_clip(desktop, "rear-door-open")
    await desktop.locator(".bug-mark").wait_for(state="visible", timeout=180000)
    poster_src = await desktop.locator("#scene-poster").get_attribute("src")
    assert "checkpoint-bug-" in (poster_src or "")
    await desktop.screenshot(path=str(QA / "checkpoint-production-desktop-bug.png"), full_page=True, animations="disabled")
    await desktop.get_by_role("button", name="光線銃を撃つ", exact=True).click()
    await desktop.locator(".clear-message").wait_for(state="visible", timeout=30000)
    poster_src = await desktop.locator("#scene-poster").get_attribute("src")
    assert "checkpoint-bug-" in (poster_src or "")
    await desktop.screenshot(path=str(QA / "checkpoint-production-desktop-clear.png"), full_page=True, animations="disabled")
    await desktop.get_by_role("button", name="もう一度", exact=True).click()
    assert await desktop.locator("#app").get_attribute("data-phase") == "start"
    replay = await desktop.evaluate("window.__HON_LION_SCENE__.snapshot()")
    assert replay["currentNode"] == "a" and replay["checkpointNode"] == "hall", replay
    assert not errors, errors
    await desktop.close()

    mobile = await browser.new_page(viewport={"width":390,"height":844})
    await start_demo(mobile, static_url, procedure_fixture=False)
    await configure_production_checkpoint_media(mobile)
    for question, answer, step in [
        ("音も幻覚ですか？", "いいえ", "step1"),
        ("音を出しているのは自分ですか？", "いいえ", "step2"),
        ("音を生む出来事が認知機能を低下させていますか？", "はい", "step3"),
        ("ここは幻覚ですか？", "はい", "step4"),
        ("音は自分の耳の中から聞こえますか？", "はい", "step5"),
    ]:
        await ask(mobile, question, answer)
        await complete_production_steps(mobile, (step,))
    progress = await mobile.evaluate("window.__HON_LION_CHECKPOINTS__.snapshot()")
    assert progress["reachedCheckpointIds"] == ["cp1","cp2","cp3","cp4","cp5"], progress
    mobile_phase = await mobile.locator("#app").get_attribute("data-phase")
    assert progress["solved"] is False and mobile_phase == "question", progress
    assert await mobile.get_by_role("button", name="部屋の鍵でドアを開ける", exact=True).count() == 0
    await mobile.screenshot(path=str(QA / "checkpoint-production-mobile-unsolved.png"), full_page=True, animations="disabled")
    await mobile.close()
    print(f"checkpoint production media PASS: desktop solved/replay, mobile NO-first unsolved five IDs; {QA}", flush=True)


async def partial_and_direct(page, static_url, wait_for_scene=False):
    print("smoke: partial and direct theory", flush=True)
    await start_demo(page, static_url, wait_for_scene=wait_for_scene)
    await ask(page, "虫ですか？", "はい")
    assert await page.locator("#app").get_attribute("data-reasoning-stage") == "0"
    await page.locator("#theory-toggle").click()
    await page.locator("#question-input").fill("耳に虫がいる")
    await page.locator("#question-send").click()
    assert await page.locator(".message.lion").last.text_content() == "はい"
    assert await page.locator("#app").get_attribute("data-reasoning-stage") == "0"
    assert await page.locator("img[src*='key.png']").count() == 0

async def guarded_synthesis(page, static_url):
    print("smoke: guarded live synthesis", flush=True)
    async def unqualified(route):
        await route.fulfill(status=200, content_type="application/json", body='{"outcome":{"choice":"SOLVED","confidence":0.2,"reasoning_progress":"SYNTHESIS"},"reasoningProgress":"SYNTHESIS","keyIssued":false}')
    await page.route("**/api/hon-lion/chat", unqualified)
    await page.goto(static_url, wait_until="domcontentloaded")
    await page.get_by_role("button", name="はじめる").click()
    await advance_intro(page)
    await page.locator("#theory-toggle").click()
    await page.locator("#question-input").fill(THEORY)
    await page.locator("#question-send").click()
    assert await page.locator("#app").get_attribute("data-reasoning-stage") == "0"
    assert await page.locator("img[src*='key.png']").count() == 0
    assert await page.locator("#question-form").is_hidden()
    await page.unroute("**/api/hon-lion/chat")

async def missing_key(page, worker_url):
    print("smoke: live missing key", flush=True)
    async def unavailable(route):
        await route.fulfill(status=503, content_type="application/json", body='{"error":"live_unavailable"}')
    await page.route("**/api/hon-lion/chat", unavailable)
    await page.goto(worker_url, wait_until="domcontentloaded")
    await page.get_by_role("button", name="はじめる").click()
    await advance_intro(page)
    await page.locator("#ask-toggle").click()
    await page.locator("#question-input").fill("ここは幻覚ですか？")
    await page.locator("#question-send").click()
    await page.wait_for_timeout(100)
    assert "接続がまだ設定されていません" in await page.locator("#system-note").text_content()
    assert await page.locator(".message.lion").count() == 0
    await page.unroute("**/api/hon-lion/chat")

async def viewports(browser, static_url):
    for width, height in ((390,590),(390,600),(390,844),(852,600)):
        print(f"smoke: viewport {width}x{height}", flush=True)
        page = await browser.new_page(viewport={"width":width,"height":height})
        await start_demo(page, static_url, wait_for_scene=(width,height)==(390,590))
        assert await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        if (width,height) in ((390,590),(390,844)):
            await page.screenshot(path=str(QA / f"conversation-mobile-{width}x{height}.png"), full_page=True)
        await page.locator("#ask-toggle").click()
        await page.locator("#question-input").focus()
        assert await page.locator("#question-input").is_visible()
        await page.close()

async def mobile_keyboard(browser, static_url):
    # Desktop browser emulation cannot open a native soft keyboard. Model its
    # visual-viewport resize/pan separately from the unchanged layout viewport.
    for width, height, visible_height in ((390,844,460),(390,590,300),(844,390,230)):
        page = await browser.new_page(viewport={"width":width,"height":height}, is_mobile=True, has_touch=True, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.add_init_script("""(() => {
            const viewport = new EventTarget();
            Object.assign(viewport, {width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0,scale:1});
            Object.defineProperty(window, 'visualViewport', {value:viewport});
            window.setKeyboardViewport = (height, offsetTop=0, scale=1) => {
                Object.assign(viewport, {height,offsetTop,scale});
                viewport.dispatchEvent(new Event('resize'));
                viewport.dispatchEvent(new Event('scroll'));
            };
        })()""")
        await page.route("**/api/hon-lion/status", lambda route: route.fulfill(json={"configured":True}))
        await page.route("**/api/hon-lion/chat", lambda route: route.fulfill(json={
            "outcome":{"choice":"NO","confidence":1,"reasoning_progress":"NONE"},"keyIssued":False
        }))
        await page.goto(static_url, wait_until="domcontentloaded")
        await page.evaluate("setKeyboardViewport(innerHeight)")
        assert await page.title() == "水平思考ゲーム"
        await page.get_by_role("button", name="はじめる").tap()
        await advance_intro(page)
        baseline = await page.locator("#scene-poster").bounding_box()
        for button in ("#ask-toggle", "#theory-toggle", "#ask-toggle"):
            await page.locator(button).tap()
            assert await page.locator("#question-form").is_visible()
            assert await page.evaluate("document.activeElement.id !== 'question-input'")
            await page.locator("#question-input").tap()
            await page.locator("#question-input").fill("入力中の文章を残します。")
            for offset in (0,70,25):
                await page.evaluate("([height,offset]) => setKeyboardViewport(height,offset)", [visible_height,offset])
                await page.wait_for_timeout(50)
                geometry = await page.evaluate("""() => {
                    const rect = id => document.getElementById(id).getBoundingClientRect();
                    return {top:rect('scene-poster').top-visualViewport.offsetTop,
                        height:rect('scene-poster').height, width:rect('scene-poster').width,
                        inputTop:rect('question-input').top, inputBottom:rect('question-input').bottom,
                        sendBottom:rect('question-send').bottom, topLimit:visualViewport.offsetTop,
                        bottomLimit:visualViewport.offsetTop+visualViewport.height,
                        scrollY, overflow:document.documentElement.scrollWidth>innerWidth};
                }""")
                assert abs(geometry["top"]-baseline["y"]) < 1, geometry
                assert abs(geometry["height"]-baseline["height"]) < 1, geometry
                assert abs(geometry["width"]-baseline["width"]) < 1, geometry
                assert geometry["inputTop"] >= geometry["topLimit"], geometry
                assert geometry["inputBottom"] <= geometry["bottomLimit"], geometry
                assert geometry["sendBottom"] <= geometry["bottomLimit"], geometry
                assert geometry["scrollY"] == 0 and not geometry["overflow"], geometry
            await page.locator("#composer-cancel").tap()
            await page.evaluate("setKeyboardViewport(innerHeight)")
            await page.wait_for_timeout(50)
            assert await page.locator("#question-form").is_hidden()
            assert await page.evaluate("document.activeElement.id !== 'question-input'")
            assert await page.locator("#scene-poster").bounding_box() == baseline
        # A response restores reading mode; a failed request keeps the draft
        # without reopening the keyboard or moving focus back into the textarea.
        await page.locator("#ask-toggle").tap()
        await page.locator("#question-send").tap()
        await page.locator(".message.lion:not([hidden])").wait_for(state="visible")
        assert await page.locator("#question-form").is_hidden()
        await page.unroute("**/api/hon-lion/chat")
        await page.route("**/api/hon-lion/chat", lambda route: route.fulfill(status=503, json={"error":"live_unavailable"}))
        await page.locator("#theory-toggle").tap()
        await page.locator("#question-send").tap()
        await page.wait_for_function("document.querySelector('#system-note').textContent.includes('設定されていません')")
        assert await page.locator("#question-input").input_value() == "入力中の文章を残します。"
        assert await page.evaluate("document.activeElement.id !== 'question-input'")
        await page.locator("#question-input").tap()
        await page.evaluate("(height) => setKeyboardViewport(height)", visible_height)
        await page.wait_for_timeout(50)
        assert await page.evaluate("""() => {
            const input = document.querySelector('#question-input').getBoundingClientRect();
            const note = document.querySelector('#system-note').getBoundingClientRect();
            return input.bottom <= note.top;
        }"""), "the textarea must not overlap the error message on short screens"
        await page.locator("#conversation").evaluate("el => { el.scrollTop = el.scrollHeight; }")
        assert await page.evaluate("document.querySelector('#question-send').getBoundingClientRect().bottom <= visualViewport.height")
        await page.evaluate("setKeyboardViewport(innerHeight)")
        # Pinch zoom must not be treated as keyboard occlusion.
        await page.evaluate("setKeyboardViewport(innerHeight/2,40,2)")
        await page.wait_for_timeout(50)
        assert await page.locator("#scene-poster").bounding_box() == baseline
        await page.evaluate("setKeyboardViewport(innerHeight)")
        await page.locator("#composer-cancel").tap()
        await page.set_viewport_size({"width":height,"height":width})
        await page.evaluate("setKeyboardViewport(innerHeight)")
        await page.wait_for_timeout(50)
        assert await page.evaluate("document.querySelector('#app').getBoundingClientRect().height === innerHeight")
        # Keyboard navigation remains available even on a touch-capable device.
        await page.locator("#ask-toggle").focus()
        await page.keyboard.press("Enter")
        assert await page.evaluate("document.activeElement.id === 'question-input'")
        await page.screenshot(path=str(QA / f"keyboard-{width}x{height}.png"))
        assert not errors, errors
        await page.close()
    print("keyboard smoke PASS: touch focus, resize/pan, drafts, send/error, zoom, rotation, keyboard navigation", flush=True)

async def checkpoint_state_smoke(browser, static_url):
    for viewport in ({"width":1280,"height":720},{"width":390,"height":844}):
        page=await browser.new_page(viewport=viewport)
        errors=[]
        console_errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("console",lambda message:console_errors.append(message.text) if message.type=="error" else None)
        await start_demo(page,static_url,procedure_fixture=False)
        assert await page.title()=="水平思考ゲーム"
        await ask(page,"音も幻覚ですか？","いいえ")
        await page.wait_for_function("window.__HON_LION_CHECKPOINTS__.snapshot().blocked?.reason === 'unassigned'")
        progress=await page.evaluate("window.__HON_LION_CHECKPOINTS__.snapshot()")
        assert progress["reachedCheckpointIds"]==["cp2"]
        assert progress["completedStepIds"]==[]
        await ask(page,"音は幻覚ですか？","いいえ")
        assert (await page.evaluate("window.__HON_LION_CHECKPOINTS__.snapshot()"))["queuedStepIds"]==["step1"]
        await page.screenshot(path=str(QA/f"checkpoint-pending-{viewport['width']}.png"),full_page=True,animations="disabled")
        # A fresh page gets an explicit manual runner. No new media is claimed.
        await page.reload()
        await page.wait_for_function("Boolean(window.__HON_LION_CHECKPOINTS__)")
        await install_procedure_test_double(page,manual=True)
        await page.get_by_role("button",name="はじめる").click()
        await advance_intro(page)
        await page.locator("#theory-toggle").click()
        await page.locator("#question-input").fill(THEORY)
        await page.locator("#question-send").click()
        await page.wait_for_function("document.querySelector('#app').dataset.phase === 'checkpoint_completion'")
        for i in range(1,6):
            step=f"step{i}"
            await page.wait_for_function("id=>Boolean(window.__TEST_STEP_RELEASES__[id])",arg=step)
            assert await page.locator("img[src*='key.png']").count()==0
            await page.evaluate("id=>window.__TEST_STEP_RELEASES__[id]({completed:true})",step)
        await page.wait_for_function("document.querySelector('#app').dataset.phase === 'entrance'")
        assert await page.evaluate("window.__TEST_STEP_CALLS__")==["step1","step2","step3","step4","step5"]
        await page.screenshot(path=str(QA/f"checkpoint-reward-{viewport['width']}.png"),full_page=True,animations="disabled")
        await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
        progress=await page.evaluate("window.__HON_LION_CHECKPOINTS__.snapshot()")
        assert progress["reachedCheckpointIds"]==[] and progress["queuedStepIds"]==[] and progress["completedStepIds"]==[]
        assert await page.locator("#app").get_attribute("data-phase")=="start"
        assert not errors,errors
        assert not console_errors,console_errors
        await page.close()
    print(f"checkpoint browser PASS: NO confirmation, duplicate, honest unassigned state, five manual ACKs before rear-door state, reset; {QA}",flush=True)

async def main(static_url, worker_url=None, intro_only=False, keyboard_only=False, browser_name="chromium", executable_path=None, checkpoints_only=False, checkpoint_production=False):
    async with async_playwright() as playwright:
        browser = await getattr(playwright, browser_name).launch(headless=True, executable_path=executable_path)
        errors=[]; console_errors=[]; requests=[]
        if checkpoints_only:
            await checkpoint_state_smoke(browser,static_url)
            await browser.close()
            return
        if checkpoint_production:
            await production_checkpoint_media(browser, static_url)
            await browser.close()
            return
        if keyboard_only:
            await mobile_keyboard(browser, static_url)
            await browser.close()
            return
        if intro_only:
            await intro_greeting(browser, static_url)
            await browser.close()
            print(f"intro smoke PASS: prologue, manor reveal, exact copy, click/keyboard, replay, 3 viewports, no console errors; screenshots: {QA}", flush=True)
            return
        page = await browser.new_page(viewport={"width":1280,"height":720})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("request", lambda request: requests.append(request.url))
        await full_demo(page, static_url)
        assert not any("/assets/scene/" in url or "/scene.gltf" in url for url in requests), [url for url in requests if "/assets/scene/" in url or "/scene.gltf" in url]
        await page.close()
        page = await browser.new_page(viewport={"width":1280,"height":720})
        await partial_and_direct(page, static_url)
        await page.close()
        page = await browser.new_page(viewport={"width":1280,"height":720})
        await guarded_synthesis(page, static_url)
        await viewports(browser, static_url)
        await mobile_keyboard(browser, static_url)
        await mobile_rewards(browser, static_url)
        if worker_url: await missing_key(page, worker_url)
        assert not errors, errors
        expected=[message for message in console_errors if "503 (Service Unavailable)" in message]
        unexpected=[message for message in console_errors if message not in expected]
        if expected: print(f"smoke: expected HTTP console errors: {expected}", flush=True)
        assert not unexpected, unexpected
        await browser.close()
        print("browser smoke PASS: conversation, rewards, guarded gate, clear, missing-key, 4 viewports", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4174/")
    parser.add_argument("--worker-url")
    parser.add_argument("--intro-only", action="store_true")
    parser.add_argument("--keyboard-only", action="store_true")
    parser.add_argument("--checkpoints-only", action="store_true")
    parser.add_argument("--checkpoint-production", action="store_true")
    parser.add_argument("--browser", choices=("chromium", "webkit"), default="chromium")
    parser.add_argument("--executable-path", help="Optional path to an existing browser binary")
    args = parser.parse_args()
    asyncio.run(main(args.url, args.worker_url, args.intro_only, args.keyboard_only, args.browser, args.executable_path,args.checkpoints_only,args.checkpoint_production))
