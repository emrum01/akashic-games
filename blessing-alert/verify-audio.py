#!/usr/bin/env python3
"""Headless Chromium smoke test for the blessing-alert audio paths."""

import json
import mimetypes
import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
URL = os.environ.get(
    "BLESSING_TEST_URL",
    "http://127.0.0.1:4173/?sat=10&bri=90&revealHold=100&h1=10&h2=20&wind=100000",
)
CHROME = os.environ.get(
    "PLAYWRIGHT_CHROMIUM",
    str(Path.home() / "Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
)


def rms_measurement(page, kind):
    return page.evaluate(
        """
        async (kind) => {
          const nodes = window.gameDebug.audioNodes();
          await nodes.ctx.resume();
          const analyser = nodes.ctx.createAnalyser();
          analyser.fftSize = 2048;
          nodes.master.connect(analyser);
          const samples = new Float32Array(analyser.fftSize);
          const play = {
            interrupt: () => window.gameDebug.cue("interrupt"),
            red: () => window.gameDebug.cue("red"),
            distant: () => window.gameDebug.playDistantCue(),
            recede: () => window.gameDebug.playRecedeCue(),
          }[kind];
          play();
          const deadline = performance.now() + 1250;
          let maxRms = 0;
          let peak = 0;
          let sumRms = 0;
          let frames = 0;
          while (performance.now() < deadline) {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) {
              sum += sample * sample;
              peak = Math.max(peak, Math.abs(sample));
            }
            const rms = Math.sqrt(sum / samples.length);
            maxRms = Math.max(maxRms, rms);
            sumRms += rms;
            frames += 1;
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          return { maxRms, meanRms: sumRms / frames, peak, frames };
        }
        """,
        kind,
    )


def advance_to_playing(page):
    page.goto(URL, wait_until="networkidle")
    for _ in range(5):
        page.locator("#intro-tv-hit").click()
        page.wait_for_timeout(90)
    page.locator("#crt-hitarea").click()
    page.wait_for_timeout(90)
    page.locator("#invite-hitarea").click()
    page.wait_for_timeout(90)
    page.locator("#instruction-panel").click()
    page.wait_for_timeout(90)
    page.locator("#instruction-panel-2").click()
    page.wait_for_timeout(120)
    for _ in range(5):
        if page.evaluate("() => window.gameDebug.state().photoMode") == "full":
            break
        page.locator("#tv-photo-hit").click()
        page.wait_for_timeout(90)
    state = page.evaluate("() => window.gameDebug.state()")
    if state["phase"] != "playing" or state["photoMode"] != "full":
        raise AssertionError(f"could not enter playing/full-photo state: {state}")


def main():
    console_errors = []
    page_errors = []
    flow = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=CHROME,
            args=[
                "--autoplay-policy=no-user-gesture-required",
                "--no-sandbox",
                "--single-process",
                "--disable-gpu",
                "--disable-features=UseMachPortRendezvous",
            ],
        )
        page = browser.new_page()
        def serve_local(route):
            relative = unquote(urlparse(route.request.url).path.lstrip("/")) or "index.html"
            asset = (ROOT / relative).resolve()
            if asset.is_file() and asset.is_relative_to(ROOT):
                route.fulfill(
                    path=str(asset),
                    content_type=mimetypes.guess_type(asset.name)[0] or "application/octet-stream",
                )
            else:
                route.continue_()

        # The managed shell isolates localhost sockets between tool processes. Route the
        # same local files into an HTTP-origin page so fetch/decode behavior is still real.
        page.route("**/*", serve_local)
        page.add_init_script(
            """
            (() => {
              const nativeCanPlayType = HTMLMediaElement.prototype.canPlayType;
              HTMLMediaElement.prototype.canPlayType = function (type) {
                if (/audio\\/ogg/i.test(type)) return "";
                return nativeCanPlayType.call(this, type);
              };
            })();
            """
        )
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")

        fallback = page.evaluate(
            """
            () => ({
              preferred: window.gameDebug.selectSoundUrl("alarm", false),
              urls: window.gameDebug.soundUrls("alarm", false),
              detectedUrls: window.gameDebug.soundUrls("alarm"),
            })
            """
        )
        flow["m4a_fallback"] = fallback
        if not fallback["preferred"].endswith(".m4a?v=sfx20260715"):
            raise AssertionError(f"ogg fallback did not select m4a: {fallback}")
        if not fallback["urls"][1].endswith(".ogg?v=sfx20260715"):
            raise AssertionError(f"ogg retry order is wrong: {fallback}")
        if not fallback["detectedUrls"][0].endswith(".m4a?v=sfx20260715"):
            raise AssertionError(f"simulated Ogg-incompatible browser did not prefer m4a: {fallback}")

        page.locator("#mute-button").click()
        page.wait_for_timeout(500)
        audio_status = page.evaluate("() => window.gameDebug.audioStatus()")
        flow["audio_status"] = audio_status
        if len(audio_status["loaded"]) != 20 or audio_status["loading"]:
            raise AssertionError(f"not all 20 AAC/Ogg buffers decoded: {audio_status}")
        for _ in range(3):
            page.locator("#intro-tv-hit").click()
            page.wait_for_timeout(90)
        flow["intro_warning_visible"] = page.locator("#intro-warning").is_visible()
        if not flow["intro_warning_visible"]:
            raise AssertionError("intro interruption did not reach the warning state")
        for _ in range(2):
            page.locator("#intro-tv-hit").click()
            page.wait_for_timeout(90)
        page.locator("#crt-hitarea").click()
        page.wait_for_timeout(250)
        flow["phase_after_interrupt"] = page.evaluate("() => window.gameDebug.state().phase")

        advance_to_playing(page)
        page.locator(".person").first.click()
        page.wait_for_timeout(50)
        modal_visible = page.locator("#confirm").is_visible()
        selected_before_cancel = page.evaluate("() => window.gameDebug.state().selected")
        if not modal_visible or not selected_before_cancel:
            raise AssertionError(
                f"person selection did not open modal: {modal_visible=}, {selected_before_cancel=}"
            )
        page.locator("#cancel-button").click()
        page.wait_for_timeout(50)
        after_cancel = page.evaluate("() => window.gameDebug.state()")
        if after_cancel["selected"] is not None or page.locator("#confirm").is_visible():
            raise AssertionError(f"cancel did not clear selection/modal: {after_cancel}")
        page.evaluate("() => window.gameDebug.expireTimer()")
        page.wait_for_function("() => window.gameDebug.state().phase === 'timeout-tv'")
        flow["timeout_after_cancel"] = page.evaluate("() => window.gameDebug.state()")
        if not flow["timeout_after_cancel"]["timeoutFired"]:
            raise AssertionError(f"timeout did not fire after cancel: {flow['timeout_after_cancel']}")

        advance_to_playing(page)
        page.evaluate("() => window.gameDebug.reveal()")
        page.wait_for_function("() => window.gameDebug.state().revealed === true")
        revealed_state = page.evaluate("() => window.gameDebug.state()")
        page.evaluate("() => window.gameDebug.expireTimer()")
        page.wait_for_function("() => window.gameDebug.state().phase === 'timeout-tv'")
        flow["timeout_after_reveal"] = page.evaluate("() => window.gameDebug.state()")
        flow["reveal_before_timeout"] = revealed_state
        if not flow["timeout_after_reveal"]["timeoutFired"]:
            raise AssertionError(f"timeout did not fire after reveal: {flow['timeout_after_reveal']}")

        measurements = {}
        for kind in ("interrupt", "red", "distant", "recede"):
            page.reload(wait_until="networkidle")
            page.locator("#mute-button").click()
            page.wait_for_timeout(350)
            measurements[kind] = rms_measurement(page, kind)
        flow["rms"] = measurements

        browser.close()

    if console_errors or page_errors:
        raise AssertionError(
            "browser errors: " + json.dumps({"console": console_errors, "page": page_errors}, ensure_ascii=False)
        )
    for kind, result in flow["rms"].items():
        if result["maxRms"] < 0.0001 or result["meanRms"] <= 0:
            raise AssertionError(f"{kind} rendered silence: {result}")
        if result["peak"] >= 1:
            raise AssertionError(f"{kind} clipped: {result}")

    print(json.dumps({"flow": flow, "console_errors": console_errors, "page_errors": page_errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"verify-audio: FAIL: {error}", file=sys.stderr)
        raise
