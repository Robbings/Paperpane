"""Build the bundled, non-secret models.dev snapshot from a local source checkout.
Usage: python3 scripts/build-model-catalog.py /path/to/models.dev
"""
import sys,json,tomllib,datetime
from pathlib import Path
root=Path(sys.argv[1])
def merge(a,b):
 r=dict(a)
 for k,v in b.items():r[k]=merge(r.get(k,{}) if isinstance(r.get(k),dict) else {},v) if isinstance(v,dict) else v
 return r
def load(p):
 d=tomllib.loads(p.read_text())
 if d.get('base_model'):
  base=root/'models'/(d['base_model']+'.toml')
  if base.exists():d=merge(load(base),d)
 return d
entries=[]
for provider,protocol in [('openai','openai-responses'),('anthropic','anthropic'),('google','gemini'),('xai','openai-chat'),('alibaba','openai-chat'),('alibaba-cn','openai-chat'),('deepseek','openai-chat'),('moonshotai-cn','openai-chat'),('zhipuai','openai-chat'),('minimax-cn','anthropic'),('volcengine','openai-chat'),('stepfun','openai-chat'),('mistral','openai-chat'),('openrouter','openai-chat'),('siliconflow-cn','openai-chat'),('groq','openai-chat')]:
 for p in sorted((root/'providers'/provider/'models').rglob('*.toml')):
  try:d=load(p)
  except (ValueError,FileNotFoundError):continue
  if 'text' not in d.get('modalities',{}).get('output',[]) or d.get('type','chat')!='chat':continue
  api={'openai-responses':'responses','openai-chat':'chat-completions','anthropic':'messages','gemini':'generate-content'}[protocol]
  # Per-protocol restrictions override base model facts.
  d=merge(d,d.get('api',{}).get(api,{}))
  c=d.get('capabilities',{});r=c.get('reasoning',{});limit=d.get('limit',{})
  reason={'kind':'unknown'}
  if r.get('supported') is False:reason={'kind':'none'}
  elif r.get('effort'):reason={'kind':'effort','values':r['effort']}
  elif r.get('budget') and r['budget'].get('max'):
   lo=r['budget'].get('min',0);hi=r['budget']['max'];reason={'kind':'budget','minTokens':lo,'maxTokens':hi,'presets':sorted(set([lo,hi]+[x for x in [1024,4096,8192] if lo<=x<=hi]))}
  elif r.get('toggle'):reason={'kind':'toggle'}
  elif r.get('supported'):reason={'kind':'auto'}
  e={'provider':provider,'protocol':protocol,'modelId':str(p.relative_to(root/'providers'/provider/'models'))[:-5],'label':d.get('name',p.stem),'vision':any(x=='image' or x.startswith('image/') for x in d.get('modalities',{}).get('input',[])),'reasoning':reason,'releaseDate':d.get('release_date',''),'status':d.get('status','active')}
  for src,dst in [('context','contextWindow'),('input','inputLimit'),('output','maxOutputTokens')]:
   if isinstance(limit.get(src),(int,float)) and 0<limit[src]<=10000000:e[dst]=int(limit[src])
  entries.append(e)
entries.sort(key=lambda e:(e['releaseDate'],e['modelId']),reverse=True)
out={'updatedAt':datetime.date.today().isoformat(),'source':'https://github.com/anomalyco/models.dev','models':entries}
Path('src/ai/model-catalog-data.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Catalog records:',len(entries))
