import { targetPower } from './timing.js';

const vertexSource = `attribute vec2 a_position; varying vec2 v_uv; void main(){ v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }`;
const fragmentSource = `precision mediump float;
varying vec2 v_uv; uniform sampler2D u_texture; uniform vec2 u_resolution; uniform vec2 u_target;
uniform float u_time; uniform float u_target_power; uniform float u_source_aspect; uniform float u_warp;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);}
void main(){vec2 p=vec2(v_uv.x,1.-v_uv.y);float tp=clamp(u_target_power,0.,1.);float radial=exp(-dot(p-u_target,p-u_target)*92.)*tp;vec2 away=normalize(p-u_target+vec2(.0001));
float sourceAspect=max(u_source_aspect,.01),screenAspect=u_resolution.x/u_resolution.y;vec2 cover=vec2(min(1.,screenAspect/sourceAspect),min(1.,sourceAspect/screenAspect));vec2 baseUv=(v_uv-.5)*cover+.5;
vec2 uv=baseUv+vec2(away.x,-away.y)*radial*(.018+.013*sin(u_time*5.))*u_warp;vec3 scene=texture2D(u_texture,uv).rgb;float grain=(noise(p*u_resolution*.018+u_time)-.5)*.018*radial;
vec3 glow=(vec3(.03,.35,.46)+vec3(1.,.72,.34)*.22)*radial;float alpha=clamp(radial*3.,0.,.95);gl_FragColor=vec4(scene+glow+grain,alpha);}`;

// The scene can retain the final video frame after the door opens. Sample the
// visible media, and wait for decoded pixels instead of substituting its poster.
export function textureSourceInfo(source) {
  if (!source) return null;
  const video = typeof source.videoWidth === 'number';
  const width = video ? source.videoWidth : source.naturalWidth;
  const height = video ? source.videoHeight : source.naturalHeight;
  const ready = video ? source.readyState >= 2 : source.complete;
  if (!ready || !(width > 0) || !(height > 0)) return null;
  const url = source.currentSrc || source.src;
  return { width, height, key: `${video ? 'video' : 'image'}:${url}:${width}x${height}:${video ? source.currentTime : ''}` };
}

export function createWebGLRenderer(canvas, getBackground, reducedMotion, onStatus = () => {}) {
  let gl = null, program = null, buffer = null, texture = null, uniforms = null;
  let available = false, error = null, sourceKey = '', textureReady = false;
  function report(nextError = null) { error = nextError; available = !error && Boolean(program && texture && textureReady); onStatus({ available, error }); }
  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const info = gl.getShaderInfoLog(shader) || 'shader compile failed'; gl.deleteShader(shader); throw new Error(info.trim()); }
    return shader;
  }
  function init() {
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    textureReady = false;
    const vs = compile(gl.VERTEX_SHADER, vertexSource), fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    uniforms = { pos:gl.getAttribLocation(program,'a_position'), texture:gl.getUniformLocation(program,'u_texture'), resolution:gl.getUniformLocation(program,'u_resolution'), target:gl.getUniformLocation(program,'u_target'), time:gl.getUniformLocation(program,'u_time'), targetPower:gl.getUniformLocation(program,'u_target_power'), sourceAspect:gl.getUniformLocation(program,'u_source_aspect'), warp:gl.getUniformLocation(program,'u_warp') };
    report();
  }
  function updateTexture(source, info) {
    if (info.key === sourceKey && textureReady) return;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      sourceKey = info.key; textureReady = true; report();
    } catch (uploadError) {
      clear(); report(uploadError.message || 'background texture upload failed');
    }
  }
  try { init(); } catch (initError) { report(initError.message); }
  const handleContextLost = (event) => { event.preventDefault(); available = false; textureReady = false; program = null; texture = null; buffer = null; report('WebGL context lost'); };
  const handleContextRestored = () => { try { sourceKey = ''; init(); } catch (restoreError) { report(restoreError.message); } };
  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);
  function draw(time, p) {
    if (error || !gl || !program || !texture) return;
    const source = getBackground(), info = textureSourceInfo(source);
    if (!info) { textureReady = false; clear(); report(); return; }
    updateTexture(source, info);
    if (!available) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), width = Math.round(p.w * dpr), height = Math.round(p.h * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${p.w}px`; canvas.style.height = `${p.h}px`; }
    gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.enableVertexAttribArray(uniforms.pos); gl.vertexAttribPointer(uniforms.pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uniforms.resolution, p.w, p.h); gl.uniform2f(uniforms.target, p.tx / p.w, p.ty / p.h); gl.uniform1f(uniforms.time, time); gl.uniform1f(uniforms.targetPower, targetPower(time)); gl.uniform1f(uniforms.sourceAspect, info.width / info.height); gl.uniform1f(uniforms.warp, reducedMotion ? .35 : 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(uniforms.texture, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function clear() { if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
  function dispose() { canvas.removeEventListener('webglcontextlost', handleContextLost); canvas.removeEventListener('webglcontextrestored', handleContextRestored); if (gl) { if (texture) gl.deleteTexture(texture); if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); } available = false; textureReady = false; gl = null; program = null; texture = null; buffer = null; }
  return { draw, clear, dispose, getStatus: () => ({ available, error }) };
}
