import { afterEach, describe, expect, it, vi } from 'vitest';
import { askJev, buildJevRequest } from '../src/jev';
import { CANONICAL_TRUTH, SOLUTION_CRITERIA, UNDECIDED } from '../src/scenario';
import worker, { chat, type Env } from '../src/index';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const env:Env={ASSETS:{fetch:vi.fn()} as unknown as Fetcher,TYPESAFE_API_KEY:'test-only-key',JEV_MODEL:'jev-latest'};
const responseBody={model:'jev-1.13.0',answers:{turn_outcome:{type:'choice',choice:'YES',confidence:.98},reasoning_progress:{type:'choice',choice:'PARTIAL_INSIGHT',confidence:.96}}};
describe('TypeSafe request and supplied scenario',()=>{
  it('retains the hospital camera setting but assesses only the three required explanations',()=>{
    for(const mode of ['question','final_theory'] as const){
      const body=buildJevRequest('jev-latest',mode,'ここは幻覚ですか？',[]);
      for(const question of Object.values(body.questions)){
        expect(question.type).toBe('choice');expect(question.instructions).toContain('state.player_message');expect(question.criteria).toBeTypeOf('object');
      }
      expect(body.state.canonical_truth).toEqual(CANONICAL_TRUTH);
      expect(body.state.unresolved).toEqual(UNDECIDED);
    }
    expect(Object.keys(buildJevRequest('jev-latest','question','質問',[]).questions.turn_outcome.criteria)).toEqual(['YES','NO','IRRELEVANT']);
    expect(Object.keys(buildJevRequest('jev-latest','final_theory','説明',[]).questions)).toEqual(Object.keys(SOLUTION_CRITERIA));
    expect(Object.keys(SOLUTION_CRITERIA)).toEqual(['world','threat','sound']);
    expect(CANONICAL_TRUTH).toContain('プレイヤーの視点は、病院で自分の耳の中を映しているカメラの映像である。');
    expect(buildJevRequest('jev-latest','final_theory','説明',[]).questions.world.instructions).toContain('省略されていても判定を下げない');
    expect(SOLUTION_CRITERIA.threat).toContain('自分の脳');
  });
  it('assesses the current final theory independently of earlier guesses',()=>{
    const history=[{player_message:'耳に虫がいる',turn_outcome:{choice:'YES',confidence:.98,reasoning_progress:'PARTIAL_INSIGHT'}}];
    const known=[{player_message:'ここは幻覚ですか？',turn_outcome:{choice:'YES',confidence:.98,reasoning_progress:'PARTIAL_INSIGHT'}}];
    const finalRequest=buildJevRequest('jev-latest','final_theory','推理を訂正する',history,known);
    expect(finalRequest.state.recentTurns).toEqual([]);
    expect(finalRequest.state.known_insights).toEqual([]);
    const questionRequest=buildJevRequest('jev-latest','question','ここは幻覚ですか？',history,known);
    expect(questionRequest.state.recentTurns).toHaveLength(1);
    expect(questionRequest.state.known_insights).toHaveLength(1);
  });
  it('retains bounded known insights after raw history rolls over and includes them in the prompt',()=>{
    const known=[{player_message:'ここは幻覚ですか？',turn_outcome:{choice:'YES',confidence:.98,reasoning_progress:'PARTIAL_INSIGHT'}}] as const;
    const history=Array.from({length:7},(_,index)=>({player_message:`質問${index}`,turn_outcome:{choice:'IRRELEVANT' as const,confidence:.98}}));
    const body=buildJevRequest('jev-latest','question','耳の虫ですか？',history,known);
    expect(body.state.recentTurns).toHaveLength(6);
    expect(body.state.known_insights).toEqual(known);
    expect(body.questions.reasoning_progress.instructions).toContain('known_insights');
  });
  it('authenticates only to the official endpoint and exposes no key or hidden assessment',async()=>{
    const provider=vi.fn(async()=>new Response(JSON.stringify(responseBody),{status:200}));vi.stubGlobal('fetch',provider);
    const response=await chat(new Request('https://hon-lion.example/api/hon-lion/chat',{method:'POST',headers:{origin:'https://hon-lion.example','content-type':'application/json'},body:JSON.stringify({mode:'question',question:'ここは幻覚ですか？'})}),env);
    const [url,init]=provider.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-only-key');
    expect(JSON.parse(String(init.body)).questions.player_message).toBeUndefined();
    const data=await response.json() as {model:string;keyIssued:boolean};expect(data.model).toBe('jev-1.13.0');expect(data.keyIssued).toBe(false);
    expect(JSON.stringify(data)).not.toContain('test-only-key');expect(JSON.stringify(data)).not.toContain('canonical_truth');
  });
  it.each([[401,'provider_auth'],[422,'provider_request_invalid'],[429,'provider_rate_limited']])('sanitizes provider %i errors',async(status,code)=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('private provider body',{status:Number(status)})));
    await expect(askJev('test-only-key','jev-latest','question','質問',[])).rejects.toMatchObject({code});
  });
  it('checks configuration without calling the provider or exposing credentials',async()=>{
    const provider=vi.fn();vi.stubGlobal('fetch',provider);
    const response=await worker.fetch(new Request('https://hon-lion.example/api/hon-lion/status'),{...env,TYPESAFE_API_KEY:undefined});
    expect(await response.json()).toEqual({configured:false,model:'jev-latest'});expect(provider).not.toHaveBeenCalled();
  });
});
