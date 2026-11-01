import test from 'node:test';import assert from 'node:assert/strict';
import {mergeEntities} from '../src/sync/merge.ts';
test('三方同步合并两端不同字段，拒绝同时修改同字段',()=>{const base={a:{title:'old',star:false}},local={a:{title:'local',star:false}},remote={a:{title:'old',star:true}};const result=mergeEntities(base,local,remote);assert.deepEqual(result.records.a,{title:'local',star:true});assert.equal(result.conflicts.length,0);assert.equal(mergeEntities(base,local,{a:{title:'remote',star:false}}).conflicts.length,1);});
test('删除与编辑形成冲突，不按设备时间覆盖',()=>{const result=mergeEntities({a:{text:'old'}},{},{a:{text:'remote',updatedAt:'2099-01-01'}});assert.equal(result.conflicts.length,1);});
test('软删除和另一端编辑也需要冲突处理',()=>{const b={a:{title:'old',deletedAt:undefined}},l={a:{title:'old',deletedAt:'2026-10-30'}},r={a:{title:'remote',deletedAt:undefined}};assert.equal(mergeEntities(b,l,r).conflicts.length,1);});
