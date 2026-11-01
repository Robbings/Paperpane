import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeEntities,mergeText} from '../src/sync/merge.ts';
const merge=(b,l,r)=>mergeEntities({a:b},{a:l},{a:r});
test('不同字段自动合并，同字段保留两个版本并选择一致的当前内容',()=>{
 const base={title:'old',star:false},local={title:'local',star:false},remote={title:'old',star:true};
 assert.deepEqual(merge(base,local,remote).records.a,{title:'local',star:true});
 assert.equal(merge(base,local,remote).versions.length,0);
 const a=merge(base,local,{title:'remote',star:false}),b=merge(base,{title:'remote',star:false},local);
 assert.deepEqual(a.records,b.records);assert.equal(a.versions.length,2);
 assert.deepEqual(a.versions.map(v=>v.path),[['title'],['title']]);
});
test('新增会话、同一会话的不同消息按身份合并，不产生待选版本',()=>{
 const base={sessions:[{id:'s',messages:[{id:'m',markdown:'base'}]}]},l=structuredClone(base),r=structuredClone(base);
 l.sessions[0].messages.push({id:'l',markdown:'left'});r.sessions[0].messages.push({id:'r',markdown:'right'});
 l.sessions.push({id:'new-left',messages:[]});r.sessions.push({id:'new-right',messages:[]});
 const result=merge(base,l,r);assert.equal(result.versions.length,0);assert.equal(result.records.a.sessions.length,3);
 assert.equal(result.records.a.sessions.find(s=>s.id==='s').messages.length,3);
 assert.deepEqual(result.records,merge(base,r,l).records);
});
test('两个设备编辑不同消息时，分别保留编辑结果',()=>{
 const base={sessions:[{id:'s',messages:[{id:'m1',markdown:'one'},{id:'m2',markdown:'two'}]}]},l=structuredClone(base),r=structuredClone(base);
 l.sessions[0].messages[0].markdown='left';r.sessions[0].messages[1].markdown='right';
 const result=merge(base,l,r);assert.equal(result.versions.length,0);assert.deepEqual(result.records.a.sessions[0].messages.map(m=>m.markdown),['left','right']);
});
test('同一消息重叠改写只保留这一段的两个版本',()=>{
 const base={sessions:[{id:'s',messages:[{id:'m',markdown:'old'}]}]},l=structuredClone(base),r=structuredClone(base);
 l.sessions[0].messages[0].markdown='local';r.sessions[0].messages[0].markdown='remote';
 l.sessions[0].messages[0].citations=[{id:'local-source'}];r.sessions[0].messages[0].citations=[{id:'remote-source'}];
 const result=merge(base,l,r);assert.equal(result.versions.length,2);assert.deepEqual(result.versions[0].path,['sessions','@s','messages','@m']);
 assert.deepEqual(result.versions.map(v=>v.value),[l.sessions[0].messages[0],r.sessions[0].messages[0]]);
 assert.deepEqual(result.records.a.sessions[0].messages[0],result.versions.find(v=>v.value.markdown===result.records.a.sessions[0].messages[0].markdown).value);
});
test('不重叠的文本编辑自动拼接，重叠编辑不猜测',()=>{
 assert.equal(mergeText('甲\n乙\n丙','甲改\n乙\n丙','甲\n乙\n丙改'),'甲改\n乙\n丙改');
 assert.equal(mergeText('旧内容','本机内容','远端内容'),undefined);
});
test('版本号、阅读进度、窗口布局和不同创建时间不保存冲突版本',()=>{
 const b={revision:'b',createdAt:'2026-01-03',position:{page:0},explanationWindows:[]};
 const l={revision:'l',createdAt:'2026-01-01',position:{page:1},explanationWindows:[{id:'a'}]};
 const r={revision:'r',createdAt:'2026-01-02',position:{page:2},explanationWindows:[{id:'b'}]};
 assert.equal(merge(b,l,r).versions.length,0);
});
test('标签新增合并，基于共同版本删除标签不会复活',()=>{
 const result=merge({tagIds:['a','b']},{tagIds:['a','l']},{tagIds:['a','b','r']});
 assert.deepEqual(result.records.a.tagIds,['a','l','r']);assert.equal(result.versions.length,0);
});
test('删除与编辑相遇保留可读正文，两个状态均有历史',()=>{
 const hard=mergeEntities({a:{text:'old'}},{},{a:{text:'remote'}});
 assert.equal(hard.records.a.text,'remote');assert.equal(hard.versions.length,2);
 const soft=merge({text:'old'},{text:'old',deletedAt:'2026-10-30'},{text:'remote'});
 assert.equal(soft.records.a.text,'remote');assert.equal(soft.records.a.deletedAt,undefined);assert.equal(soft.versions.length,2);
});
