import {
  PARRY_ANIMATION,
  clamp,
  dogPhase,
  heightOf,
  parryBeat,
  positionOf,
  visibleEvents,
} from "./course.js";

const INK = "#f4f4f4";
const BLACK = "#0b0b0b";
const STRIPE_EDGE = 0.142;
// The crop of the atlas's side view ends at the tires.
const TRUCK_SIDE = [204, 7, 1125, 495];
const REAR_NEAR = -2.75;
const REAR_CAMERA_DISTANCE = 5.1;
const STREET_SCROLL_SPEED = 0.59;

function noise(index) {
  const sample = Math.sin(index * 128.123 + 78.37) * 43758.5453;
  return sample - Math.floor(sample);
}

function stroke(ctx, points, color, width = 1, fill) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (fill) {
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function outline(ctx, points, fill = BLACK, color = INK, width = 1.2) {
  stroke(ctx, points, color, width, fill);
}

function hatching(ctx, points, spacing, color, slope = 1.5) {
  const left = Math.min(...points.map(([x]) => x));
  const right = Math.max(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const bottom = Math.max(...points.map(([, y]) => y));
  ctx.save();
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.clip();
  ctx.beginPath();
  const spread = (bottom - top) / slope;
  for (let x = left - spread; x < right + spread; x += spacing) {
    ctx.moveTo(x, bottom + 1);
    ctx.lineTo(x + spread, top - 1);
  }
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function notebook(ctx, w, h) {
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  for (let x = 0; x < w; x += 24) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += 24) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.strokeStyle = "#ffffff15";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function mountainRange(ctx, w, h, distance, unit) {
  const ridge = [];
  const horizon = h * 0.44;
  const spacing = 53 * unit;
  const shift = distance * 2.8 * unit;
  const start = Math.floor(shift / spacing) - 1;
  for (let i = start; i < start + w / spacing + 4; i += 1) {
    const x = i * spacing - shift;
    const peak = (10 + 85 * noise(i * 9) ** 2) * unit;
    ridge.push([x, horizon - peak], [x + spacing * 0.38, horizon - peak * 0.53]);
  }
  const land = [[-100, horizon + 23], ...ridge, [w + 100, horizon + 23]];
  outline(ctx, land, "#101010", "#8f8f8f", 0.9);
  hatching(ctx, land, 4 * unit, "#ffffff22", 1.15);
  for (let i = 0; i + 2 < ridge.length; i += 2) {
    const [x, y] = ridge[i];
    stroke(
      ctx,
      [
        [x, y],
        [x + spacing * 0.19, y + 14 * unit],
        [x + spacing * 0.28, horizon + 10],
      ],
      "#a3a3a3",
      0.66
    );
  }
}

function drawNeighborhood(ctx, image, sky, w, h, distance, unit) {
  const height = h * 0.42;
  if (sky.naturalWidth) {
    ctx.drawImage(sky, 0, 0, sky.width, sky.height * 0.34, 0, 0, w, height);
  }
  const width = Math.max(w * 0.68, height * image.width / image.height);
  const offset = distance * 7.4 * unit * STREET_SCROLL_SPEED;
  let tile = Math.floor(offset / width);
  // Adjacent mirrored panels share a boundary as the panorama scrolls.
  for (let x = tile * width - offset; x < w; x += width) {
    const mirrored = tile % 2 !== 0;
    ctx.save();
    ctx.translate(x + (mirrored ? width : 0), 0);
    ctx.scale(mirrored ? -1 : 1, 1);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
    tile += 1;
  }
}

function lavaField(ctx, w, h, distance, time, unit, magma) {
  const horizon = h * 0.415;
  const fieldHeight = h - horizon;
  const heat = ctx.createLinearGradient(0, horizon, 0, h);
  heat.addColorStop(0, "#1c0708");
  heat.addColorStop(0.24, "#641010");
  heat.addColorStop(0.69, "#31090d");
  heat.addColorStop(1, "#500e13");
  ctx.fillStyle = heat;
  ctx.fillRect(0, horizon, w, fieldHeight);

  if (magma.naturalWidth) {
    const bands = 8;
    const tileWidth = w * 1.35;
    for (let row = 0; row < bands; row += 1) {
      const depth = row / bands;
      const offset = distance * (5.6 + depth * 2.1) * unit + time * unit * 3;
      const y = horizon + fieldHeight * depth;
      let tile = Math.floor(offset / tileWidth);
      for (let x = tile * tileWidth - offset; x < w; x += tileWidth) {
        const mirrored = tile % 2 !== 0;
        ctx.save();
        ctx.translate(x + (mirrored ? tileWidth : 0), 0);
        ctx.scale(mirrored ? -1 : 1, 1);
        ctx.drawImage(magma, 0, magma.height * depth, magma.width, magma.height / bands,
          0, y, tileWidth + 0.8, fieldHeight / bands + 0.8);
        ctx.restore();
        tile += 1;
      }
    }
  } else {
    // Each crest has a dark front face, a warm translucent shoulder and a thin lip.
    for (let row = 0; row < 8; row += 1) {
      const depth = (row + 0.55) / 8;
      const y = horizon + fieldHeight * depth ** 1.75;
      const height = (3.4 + depth ** 1.4 * 30) * unit;
      const width = (72 + depth * 205) * unit;
      const here = (x) => {
        const phase = (x + distance * (2.5 + depth * 11) * unit) / width * Math.PI * 2 + row * 1.7;
        return y + height * (0.36 * Math.sin(phase + time * 1.1) +
          0.17 * Math.sin(phase * 2.16 - time * 0.66) + 0.052 * Math.sin(phase * 5.8 + row));
      };
      const crest = [];
      for (let x = -8; x < w + 20; x += Math.max(5, width / 27)) {
        crest.push([x, here(x)]);
      }
      const face = [...crest];
      for (let i = crest.length - 1; i >= 0; i -= 1) {
        const [x, py] = crest[i];
        face.push([x, py + height * 1.14]);
      }
      const color = ctx.createLinearGradient(0, y - height * 0.6, 0, y + height * 1.6);
      color.addColorStop(0, "#ac2925");
      color.addColorStop(0.3, "#571016");
      color.addColorStop(0.78, "#22080c");
      color.addColorStop(1, "#3f1015");
      stroke(ctx, face, "#491014", 0.7, color);
      stroke(ctx, crest, row < 2 ? "#ad34318a" : "#b41f23", (0.9 + depth * 4.25) * unit);
      stroke(ctx, crest, row < 2 ? "#d65c4d9e" : "#ff594be0", (0.34 + depth * 0.89) * unit);
      for (let x = -(distance * (3 + depth * 5) % 48); x < w + 40; x += 48 * unit) {
        const length = (9 + noise(x + row * 143) * 38) * unit;
        const py = here(x) + height * 0.66;
        stroke(ctx, [[x, py], [x + length * 0.52, py - 1], [x + length, py - 3 * unit]], "#c845325f", 0.64 * unit);
      }
    }
  }

  for (let i = 0; i < Math.ceil(w / (54 * unit)); i += 1) {
    const phase = (noise(i + 79) + time * (0.13 + noise(i) * 0.19)) % 1;
    const x = i * 54 * unit + noise(i * 4) * 28 * unit;
    const depth = 0.16 + noise(i * 17.3) * 0.8;
    const y = horizon + fieldHeight * depth - phase * 35 * unit;
    ctx.globalAlpha = 0.60 * Math.sin(phase * Math.PI);
    ellipse(ctx, x, y, 1.8 * unit, 0.88 * unit, "#b72828", "#f45a48", 0.6);
  }
  ctx.globalAlpha = 1;
}

function rearScaleFor(ahead) {
  return REAR_CAMERA_DISTANCE / (REAR_CAMERA_DISTANCE + Math.max(REAR_NEAR, ahead));
}

function childHeight(unit, rear, ahead = 0) {
  return rear ? 1.43 * rear.vertical * rearScaleFor(ahead) : 111 * unit;
}

function rearViewFor(width, height, playBottom) {
  const imageWidth = Math.max(width, height * (1672 / 941));
  const imageHeight = imageWidth * (941 / 1672);
  const left = (width - imageWidth) * 0.53;
  const horizon = height * 0.34;
  const top = horizon - imageHeight * 0.34;
  const vanishingX = left + imageWidth * 0.624;
  const playerX = left + imageWidth * 0.513;
  const playerY = Math.max(horizon + 1, Math.min(height * 0.932, playBottom));
  const vertical = Math.min((playerY - horizon) / 2.08, width * 0.365);
  const lateral = Math.min(vertical, width * 0.273);
  const project = (ahead, depth = 0, lift = 0) => {
    const factor = rearScaleFor(ahead);
    return [
      vanishingX + (playerX - vanishingX + depth * lateral) * factor,
      horizon + (playerY - horizon - lift * vertical) * factor,
    ];
  };
  return { left, top, imageWidth, imageHeight, width, height, horizon, vanishingX, vertical, lateral, project };
}

function mirroredPhase(section) {
  const progress = section % 1;
  return Math.floor(section) % 2 === 0 ? progress : 1 - progress;
}

function drawRoadside(ctx, image, view, distance, side, ratio) {
  const { left, top, imageWidth, imageHeight, width, horizon, vanishingX } = view;
  const leftSide = side < 0;
  const edge = leftSide ? left : left + imageWidth;
  const span = edge - vanishingX;
  const base = top + imageHeight * (leftSide ? 0.62 : 0.71);
  const upright = imageHeight * (leftSide ? 0.87 : 1.02);
  const incline = (base - horizon) / span;
  const shear = incline - upright * 0.57 / span;
  const phase = distance * STREET_SCROLL_SPEED + (leftSide ? 0 : 9.2);
  const far = vanishingX + span * 0.045;
  const from = leftSide ? Math.max(0, edge) : far;
  const end = leftSide ? far : Math.min(width, edge);
  const step = Math.max(1.6, width / 176);

  // Both rooflines and masonry use the same longitudinal coordinate on the plane.
  // Changing the run distance brings the entire row towards the frame edges.
  ctx.save();
  for (let x = from; x < end; x += step) {
    const next = Math.min(x + step, end);
    const front = (x - vanishingX) / span;
    const back = (next - vanishingX) / span;
    const depth = (front + back) / 2;
    const sampleFront = mirroredPhase((phase + 2.4 / front) / 22) * image.width;
    const sampleBack = mirroredPhase((phase + 2.4 / back) / 22) * image.width;
    const sourceWidth = Math.max(1, Math.abs(sampleFront - sampleBack));
    const sourceX = Math.min(sampleFront, sampleBack, image.width - sourceWidth);
    const flip = sampleBack < sampleFront;
    const axis = flip ? -1 : 1;
    const origin = flip ? next : x;
    const drawnHeight = upright * depth;
    const mid = (x + next) / 2;
    const anchor = horizon + incline * (mid - vanishingX) + shear * (origin - mid);
    ctx.globalAlpha = clamp((depth - 0.045) / 0.11);
    ctx.setTransform(ratio * axis, ratio * shear * axis, 0, ratio, ratio * origin, ratio * anchor);
    ctx.drawImage(image, sourceX, 0, sourceWidth, image.height, 0, -drawnHeight,
      next - x + 0.23, drawnHeight);
  }
  ctx.restore();
}

function drawRearMagma(ctx, image, view, time, distance) {
  const { width, height, horizon, vanishingX } = view;
  const fieldHeight = height - horizon;
  const bands = 38;
  const wobble = 2.2 * Math.sin(time * 1.5);
  const travel = distance * 0.49 + time * 0.38;
  const sample = (depth) => (0.45 + 0.54 * mirroredPhase((travel + 5.7 / depth) / 13)) * image.height;

  ctx.save();
  for (let band = 0; band < bands; band += 1) {
    const start = 0.10 + 0.90 * (band / bands) ** 1.45;
    const end = 0.10 + 0.90 * ((band + 1) / bands) ** 1.45;
    const depth = (start + end) / 2;
    const firstRow = sample(start);
    const lastRow = sample(end);
    const rows = Math.max(1, Math.abs(lastRow - firstRow));
    const flip = lastRow < firstRow;
    const y = horizon + fieldHeight * start;
    const bandHeight = fieldHeight * (end - start) + 0.8;
    const scale = 1.07 + depth * 0.64;
    const x = vanishingX * (1 - scale) + wobble * depth;
    ctx.globalAlpha = 0.91 * clamp((depth - 0.10) / 0.15);
    if (flip) {
      ctx.save();
      ctx.translate(0, y * 2 + bandHeight);
      ctx.scale(1, -1);
    }
    ctx.drawImage(image, 0, Math.min(firstRow, lastRow), image.width, rows, x, y, width * scale, bandHeight);
    if (flip) {
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawRearScenery(ctx, image, roadside, view, time, distance, ratio) {
  const { left, top, imageWidth, imageHeight } = view;
  ctx.drawImage(image, left, top, imageWidth, imageHeight);
  drawRearMagma(ctx, image, view, time, distance);
  if (roadside.naturalWidth) {
    drawRoadside(ctx, roadside, view, distance, -1, ratio);
    drawRoadside(ctx, roadside, view, distance, 1, ratio);
  }
}

function sideProject(width, height, unit, playBottom) {
  const x0 = width * (width < 580 ? 0.235 : 0.287);
  const y0 = Math.min(height * 0.665, playBottom);
  return (x, z = 0, y = 0) => [x0 + x * 45 * unit, y0 - y * 41 * unit];
}

function stripQuad(project, start, end, depth, radius, lift = 0) {
  return [
    project(start, depth - radius, lift), project(end, depth - radius, lift),
    project(end, depth + radius, lift), project(start, depth + radius, lift),
  ];
}

function stripeSegments(events, run, rear) {
  const near = rear ? REAR_NEAR : -16;
  const segments = [];
  let start = near;
  for (const event of events) {
    if (!event.length) {
      continue;
    }
    const { ahead, depth } = positionOf(event, run.distance);
    const end = ahead + event.length;
    if (ahead > start) {
      segments.push([start, ahead, 0]);
    }
    if (event.kind === "fold" && end > near) {
      segments.push([Math.max(near, ahead), end, depth]);
    }
    start = Math.max(start, end);
  }
  segments.push([start, rear ? 126 : 57, 0]);
  return segments;
}

function drawStripes(ctx, project, events, run, rear) {
  const segments = stripeSegments(events, run, rear);
  if (rear) {
    // The plate already darkens the main path. Follow the offset stripe too.
    for (const [start, end, depth] of segments) {
      for (const radius of [0.52, 0.41, 0.31, 0.22]) {
        stroke(ctx, stripQuad(project, start, end, depth, radius), "transparent", 0.5, "#230c1016");
      }
    }
  }
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const [start, end, depth] = segments[index];
    if (rear) {
      stroke(ctx, stripQuad(project, start, end, depth, STRIPE_EDGE), "transparent", 0.5, "#baa49e");
      stroke(ctx, stripQuad(project, start, end, depth, STRIPE_EDGE, 0.028), "#fbefe386", 0.58, "#eee5dc");
      drawPaintWear(ctx, project, start, end, depth, run.distance);
    } else {
      const center = [project(start, depth), project(end, depth)];
      stroke(ctx, center, "#441717", 9);
      stroke(ctx, center, "#eee5dc", 5.75);
    }
  }
}

function drawPaintWear(ctx, project, start, end, depth, distance) {
  // Marks scroll with the road and stop cleanly at gaps.
  const spacing = 0.47;
  const first = Math.ceil((start + distance) / spacing);
  const last = Math.floor((Math.min(end, 18) + distance) / spacing);
  for (let index = first; index <= last; index += 1) {
    const from = index * spacing - distance;
    const until = Math.min(end, from + 0.1 + noise(index + 17) * 0.21);
    const across = depth + (noise(index + 5) - 0.5) * 0.19;
    stroke(ctx, [project(from, across, 0.03), project(until, across, 0.03)], "#917c6b45", 1.05);
  }
}

function ellipse(ctx, x, y, radiusX, radiusY, color, fill, width = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawTruck(ctx, project, event, run, unit, image) {
  const { ahead: x, depth: z } = positionOf(event, run.distance);
  if (!image.naturalWidth) {
    drawSideTruckFallback(ctx, project, x, unit);
    return;
  }
  const [left, top, width, height] = TRUCK_SIDE;
  const atlasScale = image.naturalWidth / 1536;
  const [center, ground] = project(x, z);
  const [, roof] = project(x, z, 2.2);
  const drawHeight = ground - roof;
  const drawWidth = drawHeight * width / height;

  ellipse(ctx, center, ground + 1.5, drawWidth * 0.46, drawHeight * 0.056, "#18161745", "#1512158a", 0.5);
  ctx.drawImage(
    image,
    left * atlasScale, top * atlasScale, width * atlasScale, height * atlasScale,
    center - drawWidth / 2, ground - drawHeight, drawWidth, drawHeight,
  );
}

function drawRearTruck(ctx, view, ahead, depth, image) {
  const factor = rearScaleFor(ahead);
  const [x, y] = view.project(ahead, depth);
  const width = 2.07 * view.lateral * factor;
  const height = 2.25 * view.vertical * factor;
  ellipse(ctx, x, y, width * 0.47, height * 0.038, "#f674336e", "#240b0b96", 1);
  if (image.naturalWidth) {
    const scale = image.naturalWidth / 1254;
    ctx.drawImage(image, 68 * scale, 16 * scale, 1090 * scale, 1218 * scale,
      x - width / 2, y - height, width, height);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width, height);
  outline(ctx, [[-0.37, -1], [0.35, -1], [0.43, -0.91], [0.43, -0.18], [-0.37, -0.18]], "#655c6b", "#392e39", 0.009);
  outline(ctx, [[-0.43, -0.13], [-0.43, -0.53], [-0.3, -0.76], [0.25, -0.76],
    [0.38, -0.5], [0.38, -0.13]], "#e4c9a7", "#3f3030", 0.01);
  outline(ctx, [[-0.35, -0.54], [-0.27, -0.71], [0.21, -0.71], [0.3, -0.54]], "#323447", "#332835", 0.01);
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 0.28, -0.092, 0.067, 0.087, "#241725", "#2a242c", 0.008);
    ellipse(ctx, side * 0.29, -0.27, 0.071, 0.031, "#9d684a", "#fff0c7", 0.01);
  }
  ctx.restore();
}

function drawSideTruckFallback(ctx, project, x, unit) {
  const l = 2.3;
  const r = 1.42;
  const low = 0.36;
  const high = 1.94;
  const edge = 0;
  const a = project(x - l, edge, low);
  const b = project(x + r, edge, low);
  const c = project(x + r * 0.93, edge, high);
  const d = project(x - l * 0.46, edge, high);
  const e = project(x - l, edge, high * 0.68);
  const side = [a, b, c, d, e];
  outline(ctx, side, "#686565", "#c3beb3", 1.35);
  hatching(ctx, side, 4.8 * unit, "#d8d8d851");
  const cab = [
    project(x - l * 0.87, edge, high * 0.67),
    project(x - l * 0.46, edge, high * 0.94),
    project(x - 0.02, edge, high * 0.94),
    project(x - 0.1, edge, high * 0.64),
  ];
  outline(ctx, cab, "#242b35", "#bfbcb6", 1.05);
  stroke(ctx, [cab[0], cab[2]], "#d9d9d97f", 0.9);
  for (let i = 0; i <= 12; i += 1) {
    const dx = x + 0.17 + i * r * 0.058;
    stroke(
      ctx,
      [project(dx, edge, low + 0.13), project(dx + 0.02, edge, high - 0.07)],
      i % 3 === 0 ? "#aaa49b" : "#7f7b75",
      0.82
    );
  }
  const size = (8.1 * unit) / (1 + Math.max(-8, x) * 0.025);
  for (const offset of [-l * 0.65, r * 0.59]) {
    const [px, py] = project(x + offset, edge + 0.01, low - 0.11);
    ellipse(ctx, px, py, size * 0.9, size, "#e5e5e5", BLACK, 1.25);
    ellipse(ctx, px, py, size * 0.43, size * 0.48, "#a7a7a7", "#353535", 0.8);
  }
}

const RUN_POSES = [
  { hips: [0, -28], lean: 0.19, near: [14, 0], far: [-14, -8], reach: -1 },
  { hips: [1, -25], lean: 0.26, near: [2, 0], far: [-10, -18], reach: -0.55 },
  { hips: [3, -28], lean: 0.25, near: [-12, 0], far: [11, -16], reach: 0.4 },
  { hips: [2, -32], lean: 0.23, near: [-15, -7], far: [16, -6], reach: 1 },
  { hips: [0, -28], lean: 0.19, near: [-14, -8], far: [14, 0], reach: 1 },
  { hips: [1, -25], lean: 0.26, near: [-10, -18], far: [2, 0], reach: 0.55 },
  { hips: [3, -28], lean: 0.25, near: [11, -16], far: [-12, 0], reach: -0.4 },
  { hips: [2, -32], lean: 0.23, near: [16, -6], far: [-15, -7], reach: -1 },
];

const HOP_POSE = { hips: [2, -27], lean: 0.12, near: [16, -11], far: [-11, -12], reach: 0.25 };
const GUARD_POSE = { hips: [-2, -23], lean: -0.13, near: [18, 0], far: [-13, 0], reach: 1.5 };

function mix(a, b, t) {
  return a + (b - a) * t;
}

function stride(distance) {
  const cursor = ((distance / 2.65) % 1) * RUN_POSES.length;
  const index = Math.floor(cursor);
  const a = RUN_POSES[index];
  const b = RUN_POSES[(index + 1) % RUN_POSES.length];
  const t = cursor - index;
  const pair = (key) => a[key].map((value, axis) => mix(value, b[key][axis], t));
  return {
    hips: pair("hips"),
    lean: mix(a.lean, b.lean, t),
    near: pair("near"),
    far: pair("far"),
    reach: mix(a.reach, b.reach, t),
  };
}

function limb(ctx, points, ink, width) {
  stroke(ctx, points, BLACK, width + 2.7);
  stroke(ctx, points, ink, width);
}

function drawBag(ctx) {
  const shell = [
    [-25, -20],
    [-22, -26],
    [-14, -28],
    [-8, -25],
    [-7, -3],
    [-11, 3],
    [-24, 2],
    [-27, -4],
  ];
  outline(ctx, shell, "#1b1b1b", INK, 1.42);
  stroke(
    ctx,
    [
      [-24, -18],
      [-22, -23],
      [-13, -24],
      [-9, -21],
    ],
    "#e9e9e9",
    1.25
  );
  const lid = [
    [-24, -19],
    [-13, -22],
    [-10, -19],
    [-11, -3],
    [-17, 0],
    [-24, -3],
  ];
  outline(ctx, lid, "#282828", "#bfbfbf", 0.8);
  stroke(
    ctx,
    [
      [-22, -17],
      [-21, -5],
      [-17, -2],
    ],
    "#d6d6d6",
    0.82
  );
  outline(
    ctx,
    [
      [-18.5, -6],
      [-14.5, -6.5],
      [-14.5, -3.4],
      [-18.1, -3.3],
    ],
    "#dddddd",
    "#dddddd",
    0.75
  );
  // Carry handle and shoulder harness stay attached as the back rocks forward.
  stroke(
    ctx,
    [
      [-21, -25],
      [-21, -29],
      [-16, -30],
      [-12, -27],
    ],
    "#c8c8c8",
    1.12
  );
}

function figure(
  ctx,
  x,
  y,
  scale,
  pose,
  { rival = false, angle = 0, flail = null, startled = false } = {}
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rival ? -scale : scale, scale);
  ctx.translate(0, -24);
  ctx.rotate(angle);
  ctx.translate(0, 24);
  const ink = rival ? "#cecece" : INK;
  const [hipX, hipY] = pose.hips;
  const legs = [
    [pose.far, "#a9a9a9", -2],
    [pose.near, ink, 2],
  ];
  for (const [[fx, fy], color, lateral] of legs) {
    const knee = [mix(hipX, fx, 0.47) + (fy < -5 ? 6 : 1), mix(hipY, fy, 0.47)];
    limb(ctx, [[hipX + lateral, hipY], knee, [fx, fy - 2]], color, 4.2);
    outline(
      ctx,
      [
        [fx - 4, fy - 4],
        [fx + 3, fy - 4],
        [fx + 8, fy - 1],
        [fx + 7, fy + 1],
        [fx - 4, fy + 1],
      ],
      "#303030",
      color,
      1.14
    );
  }

  ctx.translate(hipX, hipY);
  ctx.rotate(pose.lean);
  const { reach } = pose;
  const farArm = flail?.[0] ?? [
    [-13 - reach * 5, -15],
    [-16 - reach * 7, -8 - Math.abs(reach) * 2],
  ];
  const nearArm = flail?.[1] ?? [
    [7 + reach * 8, -11],
    [12 + reach * 11, -14 - reach * 3],
  ];
  limb(ctx, [[-5, -16], ...farArm], "#aaa", 3.8);
  if (!rival) {
    drawBag(ctx);
  }
  const coat = [
    [-8, -20],
    [-1, -25],
    [8, -22],
    [11, -17],
    [8, -4],
    [9, 3],
    [-9, 3],
    [-10, -6],
  ];
  outline(ctx, coat, rival ? "#232323" : "#dedede", ink, 1.23);
  hatching(ctx, coat, 3.3, rival ? "#8888" : "#1f1f1f70", 1.3);
  if (!rival) {
    limb(
      ctx,
      [
        [-6, -21],
        [0, -15],
        [1, -3],
      ],
      "#484848",
      2.12
    );
    stroke(
      ctx,
      [
        [-7, -21],
        [-1, -14],
        [0, -4],
      ],
      "#dadada",
      0.64
    );
  }
  limb(ctx, [[5, -18], ...nearArm], ink, 3.7);
  const hand = nearArm[1];
  ellipse(ctx, hand[0], hand[1], 2.8, 2.2, ink, "#252525", 1);
  const head = [
    [-6, -28],
    [-11, -33],
    [-10, -43],
    [-4, -49],
    [6, -49],
    [13, -44],
    [15, -37],
    [13, -30],
    [8, -26],
    [-1, -26],
  ];
  outline(ctx, head, rival ? "#a5a5a5" : INK, ink, 1.14);
  const hair = [
    [-10, -31],
    [-13, -36],
    [-12, -44],
    [-15, -48],
    [-8, -47],
    [-5, -53],
    [-1, -50],
    [5, -54],
    [8, -50],
    [14, -49],
    [13, -44],
    [6, -43],
    [1, -46],
    [-2, -40],
    [-6, -41],
    [-7, -33],
  ];
  outline(ctx, hair, "#151515", ink, 1.17);
  hatching(ctx, hair, 2.5, "#f3f3f36b");
  if (startled) {
    ellipse(ctx, 9.6, -37.8, 1.9, 2.8, BLACK, INK, 1);
    ellipse(ctx, 9.3, -30.5, 2.25, 2.4, BLACK, "#222", 1);
  } else if (rival) {
    stroke(
      ctx,
      [
        [5, -40],
        [11, -37.7],
        [14, -38.2],
      ],
      BLACK,
      1.85
    );
    stroke(
      ctx,
      [
        [7, -36.5],
        [10, -36.4],
      ],
      BLACK,
      1.28
    );
    stroke(
      ctx,
      [
        [8, -30.5],
        [12, -32.3],
      ],
      BLACK,
      1.05
    );
  } else {
    ellipse(ctx, 9.9, -37.8, 1.05, 1.65, BLACK, BLACK, 0.6);
    stroke(
      ctx,
      [
        [8.3, -31.8],
        [11.8, -31.9],
      ],
      BLACK,
      0.9
    );
  }
  ctx.restore();
}

function dogFallback(ctx, x, y, size, phase) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const legSwing = Math.sin(phase * Math.PI * 2) * 7;
  for (const [leg, wave] of [[-14, 1], [-9, -1], [10, -1], [16, 1]]) {
    const foot = [[leg, -12], [leg + legSwing * wave, -3], [leg + legSwing * wave - 3, -1]];
    stroke(ctx, foot, "#2b171d", 6);
    stroke(ctx, foot, "#f1d8ba", 3.4);
  }
  ellipse(ctx, 1, -16, 19, 9, "#24150d", "#aa632e", 1.4);
  ellipse(ctx, 19, -23, 7, 6, "#23170f", "#e3a464", 1.25);
  ellipse(ctx, -15, -25, 10, 10, "#21150f", "#c48749", 1.4);
  outline(ctx, [[-24, -28], [-24, -42], [-15, -34], [-8, -41], [-7, -29]], "#b5743f", "#332017", 1.3);
  ellipse(ctx, -19, -22, 8, 4, "#332017", "#ebd4b9", 1);
  ellipse(ctx, -24, -23, 2, 1.4, BLACK, BLACK, 1);
  ellipse(ctx, -18, -28, 1.15, 1.45, BLACK, BLACK, 1);
  ctx.restore();
}

function drawDog(ctx, project, event, run, unit, models, rear) {
  const { ahead, depth } = positionOf(event, run.distance);
  if (ahead > 23 || ahead < -8) {
    return;
  }

  const pose = dogPhase(event, run.distance);
  const [x, y] = project(ahead, depth);
  const scale = rear ? rear.vertical * rearScaleFor(ahead) / 56 : unit * 1.26;
  const phase = run.distance / 0.94;
  ellipse(ctx, x, y + 1, 21 * scale, 3.5 * scale, "#1e0a10b0", "#1e0a10d0", 0.5);
  if (!models?.draw(ctx, x, y, 47 * scale, {
    kind: "dog", mode: run.mode, pose, t: phase, yaw: rear ? 0 : -Math.PI / 2,
    bob: Math.abs(Math.sin(phase * Math.PI * 2)) * 0.065,
  })) {
    dogFallback(ctx, x, y, scale, phase);
  }
}

function ambushPole(project, event, run, unit, rear) {
  const ahead = event.at - run.distance - 1.1;
  const [x, ground] = project(ahead, event.side * 3.84);
  const height = childHeight(unit, rear, ahead) * 2.86;
  return { x, y: ground - (rear ? 0 : 31 * unit), height, width: height * 0.091 };
}

function drawAmbushPole(ctx, { x, y, height, width }) {
  const top = y - height;
  const half = width / 2;
  const base = x + half * 0.07;
  const concrete = ctx.createLinearGradient(x - half, 0, x + half, 0);
  concrete.addColorStop(0, "#372b32");
  concrete.addColorStop(0.33, "#9b8789");
  concrete.addColorStop(0.53, "#b2a4a5");
  concrete.addColorStop(1, "#50414a");
  ellipse(ctx, base, y, half * 1.32, half * 0.31, "#1c080ba0", "#321119b0", 0.6);
  outline(ctx, [
    [base - half, y], [x - half * 0.72, top + half * 0.55], [x - half * 0.39, top],
    [x + half * 0.44, top], [x + half * 0.75, top + half * 0.65], [base + half, y],
  ], concrete, "#332930", Math.max(0.65, half * 0.11));
  for (const level of [0.19, 0.52, 0.82]) {
    const band = top + height * level;
    stroke(ctx, [[x - half * 0.88, band], [x, band + half * 0.14], [x + half * 0.91, band]],
      "#52404b", Math.max(0.5, half * 0.14));
  }
  const bracket = top + height * 0.12;
  stroke(ctx, [[x - half * 1.43, bracket + half * 0.18], [x + half * 1.46, bracket]], "#483841", half * 0.32);
  stroke(ctx, [[x + half * 0.26, top + half * 1.5], [base + half * 0.39, y - half * 0.9]],
    "#49343db3", Math.max(0.5, half * 0.15));
}

function aimedRival(ctx, project, event, run, unit, models, rear, pole) {
  const { ahead, depth } = positionOf(event, run.distance);
  const [approachX, ground] = project(ahead, depth);
  const approachY = ground - (run.mode === 2 ? Math.abs(depth) * 15 * unit : 0);
  const peek = clamp((12.5 - ahead) / 3.3);
  const stepOut = clamp((8.8 - ahead) / 3.7);
  const direction = rear ? -event.side : -1;
  const x = pole.x + direction * pole.width * 0.49 * peek;
  const reveal = stepOut * stepOut * (3 - 2 * stepOut);
  const drawX = x + (approachX - x) * reveal;
  const hideY = Math.min(approachY, pole.y);
  const y = hideY + (approachY - hideY) * reveal;
  const height = childHeight(unit, rear, ahead);
  const scale = height / 72;
  const ready = clamp(1 - ahead / 8);
  const windup = ready < 0.8 ? ready / 0.8 : 1 - (ready - 0.8) * 5;
  const thrust = clamp((ready - 0.74) / 0.26);
  const pose = {
    hips: [-6 + thrust * 9, -23 + 5 * windup - 5 * thrust],
    lean: -0.36 * windup + 0.58 * thrust,
    near: [11 + 7 * thrust, 0],
    far: [-14, -5 * thrust],
    reach: -1.25 * windup + 1.7 * thrust,
  };
  ellipse(ctx, drawX, y + 1, 15 * scale, 2.8 * scale, "#171313", "#170d0c", 0.8);
  const cockedArms = [
    [
      [-11, -10],
      [1, -14],
    ],
    [
      [-11 - windup * 6, -10],
      [-14 - windup * 14, -13 - windup * 6],
    ],
  ];
  if (!models?.draw(ctx, drawX, y, height, {
    kind: "rival", mode: run.mode, pose: "push", t: 0, yaw: rear ? event.side * -0.55 : -1.54,
    contact: thrust, roll: -windup * 0.14 + thrust * 0.21,
  })) {
    figure(ctx, drawX, y, 1.16 * scale, pose, { rival: true, flail: thrust < 0.14 ? cockedArms : null });
  }
  if (ahead > 0 && ahead < 7.5) {
    const r = (0.65 + ready * 0.53) * scale;
    const eyeX = drawX - 8 * scale;
    const eyeY = y - 64 * scale;
    for (const [dx, dy] of [
      [-22, -5],
      [-13, -12],
      [4, -14],
    ]) {
      stroke(
        ctx,
        [
          [eyeX + dx * r, eyeY + dy * r],
          [eyeX + dx * r * 0.57, eyeY + dy * r * 0.59],
        ],
        INK,
        1.9 * r
      );
    }
    if (thrust > 0.16) {
      stroke(
        ctx,
        [
          [drawX + 20 * r, y - 39 * r],
          [drawX - 13 * r, y - 34 * r],
          [drawX - 26 * r, y - 29 * r],
        ],
        "#edededbf",
        1.2 * r
      );
    }
  }
}

function parryFlash(ctx, x, y, unit, t) {
  const alpha = 1 - clamp(t / 0.23);
  ctx.save();
  ctx.globalAlpha = alpha;
  const center = [x, y];
  for (let i = 0; i < 9; i += 1) {
    const theta = (i * Math.PI * 2) / 9;
    const radius = (24 + 19 * noise(i)) * unit * (0.86 + t * 1.8);
    const arc = (r, a) => [x + Math.cos(a) * r, y + Math.sin(a) * r];
    outline(
      ctx,
      [
        center,
        arc(radius * 0.29, theta - 0.19),
        arc(radius, theta),
        arc(radius * 0.3, theta + 0.11),
      ],
      INK,
      BLACK,
      0.68 * unit
    );
  }
  ctx.restore();
}

function fallingArms(t) {
  const spin = t * Math.PI * 3.4;
  return [0, Math.PI].map((offset) => {
    const theta = spin + offset;
    return [
      [Math.cos(theta) * 12, -15 + Math.sin(theta) * 11],
      [Math.cos(theta - 0.37) * 25, -16 + Math.sin(theta - 0.37) * 22],
    ];
  });
}

function lavaSplash(ctx, x, y, unit, phase, reduceMotion) {
  ctx.save();
  ctx.globalAlpha = 1 - clamp((phase - 0.28) / 0.72);
  const ripple = (21 + 73 * phase) * unit;
  ellipse(ctx, x, y + 2 * unit, ripple, ripple * 0.19, "#ef4434", "#7319154a", 1.65 * unit);
  ellipse(ctx, x, y, ripple * 0.62, ripple * 0.125, "#ff715a", "#b62b22a3", 1.12 * unit);
  const lift = (0.19 + 0.81 * Math.sin(Math.PI * Math.min(phase + 0.1, 0.8))) * unit;
  const spread = (0.68 + phase * 0.79) * unit;
  const crown = [
    [-44, 4],
    [-40, -17],
    [-23, -11],
    [-25, -43],
    [-8, -23],
    [2, -54],
    [13, -22],
    [30, -38],
    [29, -13],
    [48, -20],
    [40, 2],
    [17, 13],
    [-19, 12],
  ];
  if (phase < 0.61) {
    outline(
      ctx,
      crown.map(([dx, dy]) => [x + dx * spread, y + dy * lift]),
      "#e53a2c",
      "#ff725c",
      1.5 * unit
    );
    stroke(
      ctx,
      [
        [x - 23 * spread, y - 4 * lift],
        [x - 7 * spread, y - 19 * lift],
        [x + 3 * spread, y - 33 * lift],
      ],
      "#ffa09b",
      1.5 * unit
    );
  }
  for (let i = 0; i < (reduceMotion ? 5 : 15); i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const dx = side * (11 + (39 + 65 * noise(i + 61)) * phase) * unit;
    const dy = (21 + 62 * noise(i * 19)) * Math.sin(phase * Math.PI) * unit;
    const r = (2.2 + noise(i + 9) * 3.1) * unit * (1 - phase * 0.52);
    ellipse(ctx, x + dx, y - dy, r, r * 1.2, "#ff6e53", i % 3 === 0 ? "#ff5b43" : "#c92c22", 0.7);
  }
  ctx.restore();
}

function tossedRival(ctx, project, event, run, unit, w, h, reduceMotion, models, rear) {
  const beat = parryBeat(run);
  if (!beat) {
    return;
  }
  const t = run.deflectTime;
  const flight = clamp(
    (t - PARRY_ANIMATION.hold) / (PARRY_ANIMATION.landing - PARRY_ANIMATION.hold)
  );
  const splashPhase = clamp(
    (t - PARRY_ANIMATION.landing) / (PARRY_ANIMATION.finish - PARRY_ANIMATION.landing)
  );
  const [xStart, yStart] = project(0.77, event.side * 0.2);
  const [xProjected, yProjected] = project(6.6, 2.78, -0.18);
  const pad = Math.min(w * 0.23, 83 * unit);
  const xLanding = clamp(xProjected + (run.mode === 2 ? 22 * unit : 0), pad, w - pad);
  const yLanding = run.mode === 3 ?
    clamp(yProjected + 39 * unit, h * 0.81, h * 0.93) : h * 0.79;
  const travel = 1 - (1 - flight) ** 1.42;
  const height = childHeight(unit, rear, mix(0.77, 6.6, travel));
  const x = mix(xStart, xLanding, travel);
  const y =
    mix(yStart, yLanding, flight ** 1.28) -
    Math.sin(Math.PI * flight) * (reduceMotion ? 39 : 71) * unit;
  const pose = {
    hips: [0, -22],
    lean: -0.03,
    near: [15, -3 - 10 * Math.abs(Math.sin(flight * 8))],
    far: [-13, -13],
    reach: 0,
  };
  const angle = (reduceMotion ? -0.52 : -1.02) * Math.sin(flight * Math.PI * 0.82);
  const drawFalling = (px, py, phase) => {
    if (!models?.draw(ctx, px, py, height, {
      kind: "rival", mode: run.mode, pose: "fall", t: phase, yaw: -1.54 + phase * 0.95,
      contact: 0, roll: angle,
    })) {
      figure(ctx, px, py, 1.16 * height / 72, pose, {
        rival: true, angle, flail: fallingArms(phase), startled: true,
      });
    }
  };
  if (beat === "splash") {
    if (splashPhase < 0.36) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, yLanding + 5 * unit);
      ctx.clip();
      drawFalling(xLanding, yLanding + (12 + splashPhase * 160) * unit, 0.87 + splashPhase);
      ctx.restore();
    }
    lavaSplash(ctx, xLanding, yLanding, unit, splashPhase, reduceMotion);
    return;
  }

  if (flight > 0.03 && !reduceMotion) {
    ctx.save();
    ctx.globalAlpha = 0.64 * (1 - flight);
    stroke(
      ctx,
      [
        [x - 18 * unit, y - 13 * unit],
        [x - 39 * unit, y - 17 * unit],
        [x - 61 * unit, y - 26 * unit],
      ],
      INK,
      1.9 * unit
    );
    stroke(
      ctx,
      [
        [x - 21 * unit, y - 28 * unit],
        [x - 48 * unit, y - 32 * unit],
      ],
      INK,
      1.14 * unit
    );
    ctx.restore();
  }
  drawFalling(x, y, flight);
}

function rearPlayerFallback(ctx, x, y, height, phase, roll) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(roll);
  ctx.scale(height / 100, height / 100);
  for (const side of [-1, 1]) {
    const step = Math.max(0, Math.sin(phase * Math.PI * 2) * side);
    const leg = [[side * 7, -44], [side * 9, -22 + step * 6], [side * 7, -4 - step * 12]];
    stroke(ctx, leg.slice(0, 2), "#252333", 10);
    stroke(ctx, leg.slice(1), "#c99275", 7);
    ellipse(ctx, leg[2][0], leg[2][1], 4.6, 4.2, "#22202b", "#dddbd2", 1);
    stroke(ctx, [[side * 11, -70], [side * 17, -58], [side * 16, -45 - step * 9]], "#c99275", 5.6);
  }
  outline(ctx, [[-13, -76], [13, -76], [14, -49], [-14, -49]], "#527a99", "#202836", 1.5);
  ellipse(ctx, 0, -87, 12.5, 12.5, "#17161b", "#2b2530", 1.1);
  outline(ctx, [[-12, -73], [12, -73], [13, -52], [10, -49], [-10, -49], [-13, -52]], "#22212e", "#797388", 1.25);
  stroke(ctx, [[-10, -69], [10, -69], [10, -54], [-10, -54], [-10, -69]], "#575367", 1);
  ctx.restore();
}

function drawPlayer(ctx, project, run, unit, screen, reduced, models, rear) {
  const fall = run.fall;
  const y = heightOf(run);
  const exitDepth = rear ? run.fallSide * 0.74 : run.fallSide < 0 ? -4.3 : 2.55;
  const depth = run.reason === "gap" ? 0 : exitDepth * clamp(fall / 0.23);
  const [x, feet] = project(-fall * 1.2, depth, y);
  const [shadowX, shadowY] = project(0);
  ellipse(ctx, shadowX, shadowY + unit, 16 * unit, 3 * unit, "#05050590", "#050505b0", 0.5);
  const falling = run.state !== "playing";
  const sideShift = run.mode === 2 ? run.fallSide * fall * 39 * unit : 0;
  const contact = parryBeat(run) === "contact";
  const runningPose = stride(screen === "ready" ? 0.33 : run.distance);
  const movementPose = y > 0.1 || falling ? HOP_POSE : runningPose;
  const pose = contact || (run.parry > 0 && run.jump === null) ? GUARD_POSE : movementPose;
  ctx.globalAlpha = 1 - clamp((fall - 0.28) / 0.27);
  const guard = contact || (run.parry > 0 && run.jump === null);
  const modelPose = guard ? "parry" : falling ? "fall" : run.jump !== null ? "jump" :
    screen === "ready" ? "idle" : "run";
  const heroHeight = childHeight(unit, rear);
  if (!models?.draw(ctx, x + sideShift, feet, heroHeight, {
    kind: "hero", mode: run.mode, pose: modelPose, yaw: rear ? Math.PI : Math.PI / 2,
    t: falling ? fall : run.distance / 2.65, lift: clamp(y / 1.55), contact: guard ? 1 : 0,
    roll: -fall * 1.4,
  })) {
    if (rear) {
      rearPlayerFallback(ctx, x, feet, heroHeight, run.distance / 2.65, -fall * 1.4);
    } else {
      figure(ctx, x + sideShift, feet, 1.6 * unit, pose, { angle: -fall * 1.4 });
    }
  }
  ctx.globalAlpha = 1;
  if (falling && fall > 0.22) {
    lavaSplash(
      ctx,
      x + sideShift,
      feet + 14 * unit,
      unit * 0.93,
      clamp((fall - 0.22) / 0.45),
      reduced
    );
  }
  if (run.parry > 0 && !contact) {
    ctx.beginPath();
    ctx.arc(x + 8 * unit, feet - 41 * unit, 26 * unit, -1.05, 1.16);
    ctx.lineWidth = 2.35 * unit;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  if (!rear && !reduced && screen === "playing" && !falling && y < 0.1 && !contact) {
    const tick = (run.distance / 1.325) % 1;
    ctx.globalAlpha = (1 - tick) * 0.8;
    for (const [dy, dx] of [
      [0, 42],
      [-8, 35],
      [-16, 20],
    ]) {
      stroke(
        ctx,
        [
          [x - (dx + tick * 27) * unit, feet + dy * unit],
          [x - 15 * unit, feet + (dy - 1) * unit],
        ],
        INK,
        1.15 * unit
      );
    }
    ctx.globalAlpha = 1;
  }
}

function loadImage(file, signal) {
  const image = new Image();
  const discard = () => image.removeAttribute("src");
  signal.addEventListener("abort", discard, { once: true });
  image.src = new URL(`./assets/${file}.webp`, import.meta.url).href;
  const ready = image.decode().catch(discard).finally(() => {
    signal.removeEventListener("abort", discard);
  });
  return { image, ready };
}

export function createRenderer(canvas, controls) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { ready: Promise.resolve(), draw() {} };
  }

  const assets = new AbortController();
  const { signal } = assets;
  let models;
  const modelsReady = import("./actor-models.js")
    .then(({ createActorModels }) => (signal.aborted ? null : createActorModels()))
    .then((loaded) => {
      if (loaded && !signal.aborted) {
        models = loaded;
      }
    });
  const illustrations = ["neighborhood", "magma", "truck", "magma-lane", "truck-front"].map((file) =>
    loadImage(file, signal),
  );
  const [neighborhood, magma, truck, lavaLane, truckFront] = illustrations.map(({ image }) => image);
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = window.setTimeout(() => {
      assets.abort();
      resolve();
    }, 15000);
  });
  const ready = Promise.race([
    Promise.allSettled([modelsReady, ...illustrations.map((illustration) => illustration.ready)]),
    deadline,
  ]).then(() => {
    window.clearTimeout(timeout);
    canvas.dataset.models = models?.loaded || "canvas";
  });
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let ratio = 1;
  let playBottom = 0;
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    playBottom = Math.max(0, controls.offsetTop - 12);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * ratio);
    const pixelsHigh = Math.round(height * ratio);
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
      canvas.width = pixelsWide;
      canvas.height = pixelsHigh;
    }
  }
  const layout = new ResizeObserver(resize);
  layout.observe(canvas);
  layout.observe(controls);
  resize();

  function draw(run, now, screen) {
    if (width === 0 || height === 0) {
      return;
    }
    const unit = Math.max(0.57, Math.min(width / 1070, height / 465));
    const visualTime = motion.matches
      ? 0
      : screen === "playing"
        ? run.distance / 6
        : screen === "ready"
          ? now / 1100
          : run.distance / 6;
    const rear = run.mode === 3 ? rearViewFor(width, height, playBottom) : null;
    const project = rear?.project ?? sideProject(width, height, unit, playBottom);
    const events = visibleEvents(run);
    const actors = events.filter((event) => event.length === 0);
    const deflected = events.find((event) => event.index === run.deflected);
    const sceneryDistance = motion.matches ? 0 : run.distance;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (rear && lavaLane.naturalWidth) {
      drawRearScenery(ctx, lavaLane, neighborhood, rear, visualTime, sceneryDistance, ratio);
    } else {
      notebook(ctx, width, height);
      if (neighborhood.naturalWidth && !rear) {
        drawNeighborhood(ctx, neighborhood, lavaLane, width, height, sceneryDistance, unit);
      } else {
        mountainRange(ctx, width, height, run.distance, unit);
      }
      lavaField(ctx, width, height, sceneryDistance, visualTime, unit, magma);
    }

    drawStripes(ctx, project, events, run, rear);
    for (let index = actors.length - 1; index >= 0; index -= 1) {
      const event = actors[index];
      const { ahead, depth } = positionOf(event, run.distance);
      if (event.kind === "pusher") {
        if (ahead > 40 || (rear && ahead - 1.1 < REAR_NEAR)) {
          continue;
        }
        const pole = ambushPole(project, event, run, unit, rear);
        if (ahead <= 12.5 && event.index !== run.deflected) {
          aimedRival(ctx, project, event, run, unit, models, rear, pole);
        }
        drawAmbushPole(ctx, pole);
        continue;
      }
      const [x] = project(ahead, depth);
      if (ahead > 23 || (rear && ahead < REAR_NEAR) || x < -160 * unit || x > width + 160 * unit) {
        continue;
      }
      if (event.kind === "dog") {
        drawDog(ctx, project, event, run, unit, models, rear);
      } else if (rear) {
        drawRearTruck(ctx, rear, ahead, depth, truckFront);
      } else {
        drawTruck(ctx, project, event, run, unit, truck);
      }
    }
    drawPlayer(ctx, project, run, unit, screen, motion.matches, models, rear);
    if (deflected) {
      tossedRival(ctx, project, deflected, run, unit, width, height, motion.matches, models, rear);
      if (run.deflectTime < 0.23) {
        const [impactX, impactY] = project(0.55, 0, 1.05);
        parryFlash(ctx, impactX, impactY, unit, run.deflectTime);
      }
    }
  }
  return { ready, draw };
}
