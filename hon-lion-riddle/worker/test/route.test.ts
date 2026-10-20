import { afterEach, describe, expect, it, vi } from 'vitest';
import { askJev } from '../src/jev';
import worker, { chat, type Env } from '../src/index';
const url='https://hon-lion.example/api/hon-lion/chat';
const env=(key?:string):Env=>({ASSETS:{fetch:vi.fn()} as unknown as Fetcher,TYPESAFE_API_KEY:key,JEV_MODEL:'jev-latest',PROVISIONAL_SOLVED_CONFIDENCE:'.9'});
const body=(mode:'question'|'final_theory'='question',question='ここは幻覚ですか？')=>({mode,question});
function request(value:unknown,headers:Record<string,string>={}){return new Request(url,{method:'POST',headers:{origin:'https://hon-lion.example','content-type':'application/json',...headers},body:typeof value==='string'?value:JSON.stringify(value)});}
const finalPayload=(confidence=.98,overrides:Record<string,string>={})=>({answers:Object.fromEntries(['world','threat','sound'].map(id=>[id,{type:'choice',choice:overrides[id]||'MATCH',confidence}])),model:'jev-1.13.0'});
const reply=(payload:unknown)=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('Worker asset and API dispatch', () => {
  it('enables the demo only for an explicit local Worker flag and localhost request', async () => {
    const bindings = { ...env(), HON_LION_DEMO: '1' };
    const noQuery = await worker.fetch(new Request('http://127.0.0.1:8796/api/hon-lion/status'), bindings);
    expect(await noQuery.json()).toEqual({ configured: false, model: 'jev-latest' });
    const local = await worker.fetch(new Request('http://127.0.0.1:8796/api/hon-lion/status?demo=1'), bindings);
    expect(await local.json()).toEqual({ configured: true, model: 'local-demo' });
    const remote = await worker.fetch(new Request('https://hon-lion.example/api/hon-lion/status'), bindings);
    expect(await remote.json()).toEqual({ configured: false, model: 'jev-latest' });
    const remoteQuery = await worker.fetch(new Request('https://hon-lion.example/api/hon-lion/status?demo=1'), bindings);
    expect(await remoteQuery.json()).toEqual({ configured: false, model: 'jev-latest' });
    const remoteChat = await worker.fetch(request(body()), bindings);
    expect(remoteChat.status).toBe(503);
    expect(await remoteChat.json()).toEqual({ error: 'live_unavailable' });
    const chatRequest = new Request('http://127.0.0.1:8796/api/hon-lion/chat?demo=1', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:8796', 'content-type': 'application/json' },
      body: JSON.stringify(body('final_theory', '洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。')),
    });
    const result = await worker.fetch(chatRequest, bindings);
    expect(await result.json()).toMatchObject({ keyIssued: true, model: 'local-demo' });

    const provider = vi.fn(async () => reply({ answers: { turn_outcome: { type: 'choice', choice: 'YES', confidence: .98 }, reasoning_progress: { type: 'choice', choice: 'PARTIAL_INSIGHT', confidence: .98 } }, model: 'jev-1.13.0' }));
    vi.stubGlobal('fetch', provider);
    const configured = await worker.fetch(new Request('http://127.0.0.1:8796/api/hon-lion/chat', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:8796', 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    }), { ...bindings, TYPESAFE_API_KEY: 'key' });
    expect(await configured.json()).toMatchObject({ model: 'jev-1.13.0', reasoningProgress: 'PARTIAL_INSIGHT' });
    expect(provider).toHaveBeenCalled();
  });
  it('grades independent checkpoints from bounded semantic fixtures and persists only public IDs', async () => {
    const bindings = { ...env(), HON_LION_DEMO: '1' };
    const localRequest = (value: unknown) => new Request('http://127.0.0.1:8796/api/hon-lion/chat?demo=1', { method: 'POST', headers: { origin: 'http://127.0.0.1:8796', 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const ask = async (question: string, reachedCheckpointIds: string[] = [], recentTurns: unknown[] = []) => (await worker.fetch(localRequest({ ...body(), question, reachedCheckpointIds, recentTurns }), bindings)).json() as Promise<{ outcome:{choice:string}; reachedCheckpointIds:string[]; newlyReachedCheckpointIds:string[] }>;

    const cp2 = await ask('音も幻覚ですか');
    expect(cp2.outcome.choice).toBe('NO');
    expect(cp2.reachedCheckpointIds).toEqual(['cp2']);
    expect(cp2.newlyReachedCheckpointIds).toEqual(['cp2']);
    expect(JSON.stringify(cp2)).not.toContain('checkpointJudgments');
    const cp2Variant = await ask('音は幻覚ですか');
    expect(cp2Variant.reachedCheckpointIds).toEqual(['cp2']);
    expect(cp2Variant.newlyReachedCheckpointIds).toEqual(['cp2']);
    const duplicateState = await ask('音は幻覚ですか', ['cp2','cp2','cp2','cp2','cp2']);
    expect(duplicateState.reachedCheckpointIds).toEqual(['cp2']);
    expect(duplicateState.newlyReachedCheckpointIds).toEqual([]);

    const cp1 = await ask('ここは幻覚ですか', cp2.reachedCheckpointIds, Array.from({ length: 6 }, (_, i) => ({ player_message: `履歴${i}`, turn_outcome: { choice: 'IRRELEVANT', confidence: .9 } })));
    expect(cp1.reachedCheckpointIds).toEqual(['cp2','cp1']);
    expect(cp1.newlyReachedCheckpointIds).toEqual(['cp1']);

    const camera = await ask('病院で自分の耳の中を映すカメラ映像ですか', cp1.reachedCheckpointIds);
    expect(camera.reachedCheckpointIds).toEqual(cp1.reachedCheckpointIds);
    expect(camera.newlyReachedCheckpointIds).toEqual([]);

    const compound = await ask('見ている洋館は幻覚で、聞こえる音は現実の音ですか', cp1.reachedCheckpointIds);
    expect(compound.reachedCheckpointIds).toEqual(['cp2','cp1']);
    expect(compound.newlyReachedCheckpointIds).toEqual([]);

    const cameraCompound = await ask('この洋館は幻覚で、自分の耳のカメラ映像ですか', compound.reachedCheckpointIds);
    expect(cameraCompound.reachedCheckpointIds).toEqual(compound.reachedCheckpointIds);
    expect(cameraCompound.newlyReachedCheckpointIds).toEqual([]);

    const soundSource = await ask('心地よい音は虫が自分の脳を食べる音ですか', cameraCompound.reachedCheckpointIds);
    expect(soundSource.reachedCheckpointIds).toEqual(['cp2','cp1','cp3','cp4']);
    expect(soundSource.newlyReachedCheckpointIds).toEqual(['cp3','cp4']);

    const wrongCausal = await ask('音を聞くから脳が弱るのですか', soundSource.reachedCheckpointIds);
    expect(wrongCausal.reachedCheckpointIds).toEqual(soundSource.reachedCheckpointIds);
    expect(wrongCausal.newlyReachedCheckpointIds).toEqual([]);

    const cp5 = await ask('音を生む出来事が認知機能を低下させていますか', wrongCausal.reachedCheckpointIds);
    expect(cp5.reachedCheckpointIds).toEqual(['cp2','cp1','cp3','cp4','cp5']);
    expect(cp5.newlyReachedCheckpointIds).toEqual(['cp5']);

    const invalid = await worker.fetch(localRequest({ ...body(), question: 'x', reachedCheckpointIds: ['cp9'] }), bindings);
    expect(invalid.status).toBe(400);
  });
  it('allows a first-turn final solution, while all five checkpoints alone do not solve', async () => {
    const bindings = { ...env(), HON_LION_DEMO: '1' };
    const localRequest = (value: unknown) => new Request('http://127.0.0.1:8796/api/hon-lion/chat?demo=1', { method: 'POST', headers: { origin: 'http://127.0.0.1:8796', 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const allCheckpoints = '洋館は幻覚で、音は幻覚ではなく耳の中から聞こえ、自分は音を出しておらず、音を出す虫が認知機能を低下させている。';
    const partial = await (await worker.fetch(localRequest({ mode:'final_theory', question:allCheckpoints, reachedCheckpointIds:[] }), bindings)).json() as { keyIssued:boolean; outcome:{choice:string}; reachedCheckpointIds:string[]; newlyReachedCheckpointIds:string[] };
    expect(partial.keyIssued).toBe(false);
    expect(partial.outcome.choice).toBe('PARTIAL');
    expect(partial.reachedCheckpointIds).toEqual(['cp1','cp2','cp3','cp4','cp5']);
    expect(partial.newlyReachedCheckpointIds).toEqual(['cp1','cp2','cp3','cp4','cp5']);
    const insectOnly = await (await worker.fetch(localRequest({ mode:'final_theory', question:'耳に虫がいる', reachedCheckpointIds:[] }), bindings)).json() as { keyIssued:boolean; outcome:{choice:string}; reachedCheckpointIds:string[]; newlyReachedCheckpointIds:string[] };
    expect(insectOnly.keyIssued).toBe(false);
    expect(insectOnly.reachedCheckpointIds).toEqual([]);
    expect(insectOnly.newlyReachedCheckpointIds).toEqual([]);
    const solved = await (await worker.fetch(localRequest({ mode:'final_theory', question:'洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。' }), bindings)).json() as { keyIssued:boolean; outcome:{choice:string}; reachedCheckpointIds:string[] };
    expect(solved.keyIssued).toBe(true);
    expect(solved.outcome.choice).toBe('SOLVED');
    expect(solved.reachedCheckpointIds).toEqual([]);
  });
  it('redirects the slashless mount while preserving the query string', async () => {
    const bindings = env();
    const response = await worker.fetch(new Request('https://hon-lion.example/turtle-soup/manor?utm_source=escape'), bindings);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://hon-lion.example/turtle-soup/manor/?utm_source=escape');
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('redirects the explicit mounted index alias to the canonical game URL', async () => {
    const bindings = env();
    const response = await worker.fetch(new Request('https://hon-lion.example/turtle-soup/manor/index.html?from=legacy'), bindings);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://hon-lion.example/turtle-soup/manor/?from=legacy');
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('keeps API responses out of the HTML fallback', async () => {
    const bindings = env();
    const status = await worker.fetch(new Request('https://hon-lion.example/api/hon-lion/status'), bindings);
    expect(status.headers.get('cache-control')).toBe('no-store');
    expect(await status.json()).toEqual({ configured: false, model: 'jev-latest' });
    const missing = await worker.fetch(new Request('https://hon-lion.example/api/missing'), bindings);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('isolates mounted status and chat routes from static assets', async () => {
    const bindings = env('key');
    const provider = vi.fn(async () => reply({ answers: { turn_outcome: { type: 'choice', choice: 'YES', confidence: .98 }, reasoning_progress: { type: 'choice', choice: 'PARTIAL_INSIGHT', confidence: .98 } }, model: 'jev-1.13.0' }));
    vi.stubGlobal('fetch', provider);
    const status = await worker.fetch(new Request('https://hon-lion.example/turtle-soup/manor/api/status'), bindings);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ configured: true, model: 'jev-latest' });
    const chatRequest = new Request('https://hon-lion.example/turtle-soup/manor/api/chat', {
      method: 'POST',
      headers: { origin: 'https://hon-lion.example', 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    });
    expect((await worker.fetch(chatRequest, bindings)).status).toBe(200);
    expect(provider).toHaveBeenCalled();
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
    const unknown = await worker.fetch(new Request('https://hon-lion.example/turtle-soup/manor/api/other'), bindings);
    expect(unknown.status).toBe(404);
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('delegates game and video requests to static assets', async () => {
    const assets = vi.fn(async () => new Response('asset'));
    const bindings = { ...env(), ASSETS: { fetch: assets } as unknown as Fetcher };
    for (const path of ['/', '/assets/video/walk-a-b-wide.mp4']) {
      const assetRequest = new Request(`https://hon-lion.example${path}`);
      expect(await (await worker.fetch(assetRequest, bindings)).text()).toBe('asset');
      expect(assets).toHaveBeenLastCalledWith(assetRequest);
    }
  });
  it('strips only the exact mount prefix and preserves query and Range headers', async () => {
    const assets = vi.fn(async () => new Response('asset'));
    const bindings = { ...env(), ASSETS: { fetch: assets } as unknown as Fetcher };
    const assetRequest = new Request('https://hon-lion.example/turtle-soup/manor/assets/video/clip.mp4?v=abc', { headers: { range: 'bytes=0-99' } });
    await worker.fetch(assetRequest, bindings);
    const rewritten = (assets.mock.calls as unknown as Array<[Request]>)[0][0];
    expect(rewritten.url).toBe('https://hon-lion.example/assets/video/clip.mp4?v=abc');
    expect(rewritten.headers.get('range')).toBe('bytes=0-99');

    const nearMatch = new Request('https://hon-lion.example/turtle-soup/manor-other/assets/video/clip.mp4?v=abc');
    await worker.fetch(nearMatch, bindings);
    expect(assets).toHaveBeenLastCalledWith(nearMatch);
  });
  it('passes near-match paths through to the existing origin in mount-only mode', async () => {
    const origin = vi.fn(async () => new Response('origin'));
    vi.stubGlobal('fetch', origin);
    const assets = vi.fn(async () => new Response('asset'));
    const bindings = { ...env(), HON_LION_MOUNT_ONLY: '1', ASSETS: { fetch: assets } as unknown as Fetcher };
    const nearMatch = new Request('https://hon-lion.example/turtle-soup/manor-other/');
    expect(await (await worker.fetch(nearMatch, bindings)).text()).toBe('origin');
    expect(origin).toHaveBeenCalledWith(nearMatch);
    expect(assets).not.toHaveBeenCalled();
  });
});
describe('chat route boundary',()=>{
  it('rejects method, origin and media type before provider access',async()=>{
    const provider=vi.fn();vi.stubGlobal('fetch',provider);
    expect((await chat(new Request(url,{method:'GET',headers:{origin:'https://hon-lion.example'}}),env('key'))).status).toBe(405);
    expect((await chat(request(body(),{origin:'https://evil.example'}),env('key'))).status).toBe(403);
    expect((await chat(new Request(url,{method:'POST',headers:{origin:'https://hon-lion.example','content-type':'text/application/json'},body:JSON.stringify(body())}),env('key'))).status).toBe(415);
    expect((await chat(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body())}),env('key'))).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('checks the origin on the original request when a route supplies a rewritten request', async () => {
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);
    const original = request(body(), { origin: 'https://evil.example' });
    const rewritten = request(body());
    expect((await chat(rewritten, env('key'), original)).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('bounds raw bodies and validates every context turn',async()=>{
    const oversized=request('x'.repeat(17_000));oversized.headers.delete('content-length');
    expect((await chat(oversized,env('key'))).status).toBe(413);
    expect((await chat(request({...body(),recentTurns:[{player_message:'x'.repeat(181)}]}),env('key'))).status).toBe(400);
    expect((await chat(request({...body(),recentTurns:[{player_message:'ok',turn_outcome:{choice:'SOLVED',confidence:2}}]}),env('key'))).status).toBe(400);
  });
  it('returns missing-key and malformed-json errors without upstream calls',async()=>{
    const provider=vi.fn();vi.stubGlobal('fetch',provider);
    const unavailable=await chat(request(body()),env());expect(unavailable.status).toBe(503);expect(await unavailable.json()).toEqual({error:'live_unavailable'});
    expect((await chat(request('{"mode":'),env('key'))).status).toBe(400);expect(provider).not.toHaveBeenCalled();
  });
  it('issues a key for the three core explanations without a hospital or camera answer',async()=>{
    const provider=vi.fn(async()=>reply(finalPayload()));vi.stubGlobal('fetch',provider);
    const result=await chat(request(body('final_theory','洋館は幻覚。耳の虫が自分の脳を食べていて、心地よい音はその捕食音だ。')),env('key'));
    expect(await result.json()).toMatchObject({keyIssued:true,reply:'はい',reasoningProgress:'SYNTHESIS',model:'jev-1.13.0'});
    provider.mockImplementationOnce(async()=>reply({answers:{turn_outcome:{choice:'SOLVED',confidence:1},reasoning_progress:{choice:'SYNTHESIS'}},model:'jev-1.13.0'}));
    expect(await (await chat(request(body()),env('key'))).json()).toMatchObject({keyIssued:false,reasoningProgress:'NONE'});
  });
  it('honors the configured server threshold for a solved theory', async () => {
    const provider = vi.fn(async () => reply(finalPayload(.85)));
    vi.stubGlobal('fetch', provider);
    const bindings = env('key');
    bindings.PROVISIONAL_SOLVED_CONFIDENCE = '.8';
    const result = await chat(request(body('final_theory', '説明')), bindings);
    expect(await result.json()).toMatchObject({ keyIssued: true, reasoningProgress: 'SYNTHESIS' });
  });
  it('does not award low-confidence checkpoint judgments', async () => {
    const provider = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (payload.state.submission_mode === 'final_theory') {
        const solved = finalPayload();
        return reply({ ...solved, answers: { ...solved.answers, cp1: { type:'choice', choice:'CONFIRMED', confidence:.5 } } });
      }
      return reply({ model:'jev-1.13.0', answers: { turn_outcome:{ type:'choice', choice:'NO', confidence:.98 }, cp2:{ type:'choice', choice:'CONFIRMED_BY_NO', confidence:0 }, reasoning_progress:{ type:'choice', choice:'NONE', confidence:.98 } } });
    });
    vi.stubGlobal('fetch', provider);
    const bindings = env('key');
    const question = await (await chat(request({ ...body(), question:'音も幻覚ですか' }), bindings)).json() as { reachedCheckpointIds:string[]; newlyReachedCheckpointIds:string[] };
    expect(question.reachedCheckpointIds).toEqual([]);
    expect(question.newlyReachedCheckpointIds).toEqual([]);
    const final = await (await chat(request(body('final_theory','説明')), bindings)).json() as { reachedCheckpointIds:string[]; newlyReachedCheckpointIds:string[] };
    expect(final.reachedCheckpointIds).toEqual([]);
    expect(final.newlyReachedCheckpointIds).toEqual([]);
  });
  it('retains known insight context after raw history rolls over and suppresses exact or paraphrased repeats', async () => {
    const provider = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const repeated = payload.state.known_insights.length > 0;
      return reply({ model: 'jev-1.13.0', answers: {
        turn_outcome: { type: 'choice', choice: 'YES', confidence: .98 },
        reasoning_progress: { type: 'choice', choice: repeated ? 'NONE' : 'PARTIAL_INSIGHT', confidence: .98 },
      } });
    });
    vi.stubGlobal('fetch', provider);
    const bindings = env('key');
    const first = await (await chat(request({ ...body(), question: 'ここは幻覚ですか？' }), bindings)).json() as { knownInsights: unknown[]; reasoningProgress: string };
    expect(first.knownInsights).toHaveLength(1);
    const fillers = Array.from({ length: 6 }, (_, index) => ({ player_message: `周辺質問${index}`, turn_outcome: { choice: 'IRRELEVANT', confidence: .98 } }));
    for (const question of ['ここは幻覚ですか？', 'この洋館は幻覚なのですか？']) {
      const result = await (await chat(request({ ...body(), question, recentTurns: fillers, knownInsights: first.knownInsights }), bindings)).json() as { knownInsights: unknown[]; reasoningProgress: string };
      expect(result.reasoningProgress).toBe('NONE');
      expect(result.knownInsights).toEqual(first.knownInsights);
    }
    const secondPayload = JSON.parse(String((provider.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(secondPayload.state.recentTurns).toHaveLength(6);
    expect(secondPayload.state.known_insights).toEqual(first.knownInsights);
  });
  it('forces an exact known question to have no fresh progress even if the provider overstates it', async () => {
    const provider = vi.fn(async () => reply({ model: 'jev-1.13.0', answers: {
      turn_outcome: { type: 'choice', choice: 'YES', confidence: .98 },
      reasoning_progress: { type: 'choice', choice: 'PARTIAL_INSIGHT', confidence: .98 },
    } }));
    vi.stubGlobal('fetch', provider);
    const bindings = env('key');
    const first = await (await chat(request({ ...body(), question: 'ここは幻覚ですか？' }), bindings)).json() as { knownInsights: unknown[] };
    const repeated = await (await chat(request({ ...body(), question: 'ここは幻覚ですか？', knownInsights: first.knownInsights }), bindings)).json() as { reasoningProgress: string; knownInsights: unknown[] };
    expect(repeated.reasoningProgress).toBe('NONE');
    expect(repeated.knownInsights).toEqual(first.knownInsights);
  });
  it('uses known insights when local demo judging receives a rolled-over history', async () => {
    const bindings = { ...env(), HON_LION_DEMO: '1' };
    const localRequest = (value: unknown) => new Request('http://127.0.0.1:8796/api/hon-lion/chat?demo=1', { method: 'POST', headers: { origin: 'http://127.0.0.1:8796', 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const first = await (await worker.fetch(localRequest({ ...body(), question: 'ここは幻覚ですか？' }), bindings)).json() as { knownInsights: unknown[] };
    const fillers = Array.from({ length: 6 }, (_, index) => ({ player_message: `周辺質問${index}`, turn_outcome: { choice: 'IRRELEVANT', confidence: .98 } }));
    const repeated = await (await worker.fetch(localRequest({ ...body(), question: 'ここは幻覚ですか？', recentTurns: fillers, knownInsights: first.knownInsights }), bindings)).json() as { reasoningProgress: string };
    expect(repeated.reasoningProgress).toBe('NONE');
  });
  it('does not issue a key for low confidence or any missing criterion',async()=>{
    const provider=vi.fn(async()=>reply(finalPayload(.2)));vi.stubGlobal('fetch',provider);
    expect(await (await chat(request(body('final_theory','説明')),env('key'))).json()).toMatchObject({keyIssued:false,reasoningProgress:'NONE'});
    provider.mockImplementationOnce(async()=>reply(finalPayload(.98,{sound:'MISSING'})));
    const partial=await (await chat(request(body('final_theory','耳に虫がいる')),env('key'))).json() as {keyIssued:boolean;outcome:{choice:string}};
    expect(partial.keyIssued).toBe(false);expect(partial.outcome.choice).toBe('PARTIAL');
  });
  it('sanitizes provider failures and invalid provider responses',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('upstream secret',{status:500})));
    expect((await chat(request(body()),env('key'))).status).toBe(502);
    vi.stubGlobal('fetch',vi.fn(async()=>reply({answers:{turn_outcome:{choice:'SOLVED',confidence:2}}})));
    expect((await chat(request(body()),env('key'))).status).toBe(502);
  });
  it('aborts a timed out upstream request',async()=>{
    vi.stubGlobal('fetch',vi.fn((_input:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')));})));
    await expect(askJev('key','jev-latest','question','ここは幻覚ですか？',[],1)).rejects.toMatchObject({name:'AbortError'});
  });
});
