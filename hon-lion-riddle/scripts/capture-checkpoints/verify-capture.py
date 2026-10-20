#!/usr/bin/env python3
"""Dependency-free verification for finalized checkpoint media."""
import hashlib, json, pathlib, subprocess, sys

root = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else None
if not root or not root.is_dir():
    raise SystemExit('usage: verify-capture.py CAPTURE_OUTPUT')
manifest = json.loads((root / 'checkpoint-manifest.json').read_text())
if manifest.get('schema') != 'hon-lion-checkpoint-media-v1':
    raise SystemExit('unexpected checkpoint manifest schema')
if len(manifest.get('source_scene_sha256', '')) != 64:
    raise SystemExit('missing verified source scene hash')
errors = []
for name, expected in manifest.get('media_sha256', {}).items():
    path = root / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    if actual != expected: errors.append(f'hash mismatch: {name}')
    if path.suffix == '.mp4' and path.is_file():
        data = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,pix_fmt,width,height,r_frame_rate','-show_entries','format=size','-of','json',str(path)]))
        stream = data['streams'][0]
        want = manifest['profiles']['portrait' if name.endswith('-portrait.mp4') else 'wide']
        if (stream['codec_name'], stream['pix_fmt'], stream['width'], stream['height'], stream['r_frame_rate']) != ('h264','yuv420p',want['width'],want['height'],'30/1'): errors.append(f'video format mismatch: {name}')
        if int(data['format']['size']) >= 25 * 1024 * 1024: errors.append(f'oversize video: {name}')
if errors: raise SystemExit('\n'.join(errors))
print(f'PASS: {len(manifest["media_sha256"])} files; source scene {manifest["source_scene_sha256"]}')
