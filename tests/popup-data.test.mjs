import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSettingsStatus } from '../src/runtime/settings-status.ts';
import { recentPaperViews } from '../src/runtime/popup-data.ts';

const empty = () => ({endpoints:[],models:[],features:[],defaultModelId:null,sync:{enabled:false}});
const configured = () => ({...empty(),endpoints:[{id:'api',baseUrl:'https://api.test/v1',protocol:'openai-chat',hasKey:false}],models:[{id:'model',endpointId:'api',modelId:'test-model',label:'My model'}],defaultModelId:'model'});

test('加载和读取失败不会伪装成未配置或已保存', () => {
  const loading = deriveSettingsStatus(empty(), 'loading');
  assert.equal(loading.modelAvailability,'checking');
  assert.notEqual(loading.local,'saved');
  const failed = deriveSettingsStatus(empty(),'failed');
  assert.equal(failed.modelAvailability,'unavailable');
  assert.match(failed.modelMessage,/读取失败/);
  assert.match(failed.syncMessage,/读取失败/);
});

test('模型状态校验默认模型和关联接口，配置不等于连通性检查', () => {
  assert.equal(deriveSettingsStatus(empty(),'ready').modelAvailability,'unconfigured');
  const valid = deriveSettingsStatus(configured(),'ready');
  assert.equal(valid.modelAvailability,'configured');
  assert.equal(valid.modelLabel,'My model');
  assert.equal(deriveSettingsStatus({...configured(),defaultModelId:null},'ready').modelAvailability,'configured');
  assert.equal(deriveSettingsStatus({...configured(),endpoints:[]},'ready').modelAvailability,'unavailable');
  assert.equal(deriveSettingsStatus({...configured(),endpoints:[{id:'api',baseUrl:'javascript:alert(1)',protocol:'openai-chat'}]},'ready').modelAvailability,'unavailable');
});

test('真实翻译路由可提供模型配置；未实现同步不会显示同步成功或待同步', () => {
  const routed = {...configured(),defaultModelId:null,features:[{feature:'translate',enabled:true,modelId:'model'}]};
  assert.equal(deriveSettingsStatus(routed,'ready').modelAvailability,'configured');
  const sync = deriveSettingsStatus({...configured(),sync:{enabled:true,webdavUrl:'https://dav.test'}},'ready');
  assert.equal(sync.syncImplemented,false);
  assert.equal(sync.syncConfigured,true);
  assert.equal(sync.lastSyncedAt,null);
  assert.notEqual(sync.sync,'synced');
  assert.equal(deriveSettingsStatus({...configured(),sync:{enabled:true,webdavUrl:''}},'ready').syncConfigured,false);
});

test('最近阅读使用真实时间排序和书目标题，过滤不可读记录，进度限于有效范围', () => {
  const doc = (id,lastReadAt,patch={}) => ({id,title:id,lastReadAt,pageCount:10,file:{availability:'local'},position:{pageIndex:2,offset:.5},...patch});
  const list = [doc('a','2026-10-29T01:00:00Z'),doc('b','2026-10-29T02:00:00Z'),doc('c','2026-10-29T03:00:00Z',{position:{pageIndex:20,offset:0}}),doc('d','bad-date'),doc('e','2026-10-29T05:00:00Z',{deletedAt:'2026-10-29'}),doc('f','2026-10-29T06:00:00Z',{file:{availability:'local-missing'}}),doc('g','2026-10-29T00:00:00Z')];
  const views = recentPaperViews(list,new Map([['b','Edited library title']]));
  assert.deepEqual(views.map(v=>v.id),['c','b','a']);
  assert.equal(views[1].title,'Edited library title');
  assert.equal(views[0].progress,1);
  assert.equal(views[1].progress,.25);
});
