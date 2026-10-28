import { TRANSLATION_LANGUAGES } from '@/translation/languages';
import { llmTranslationSettings } from '@/translation/settings';
import { Select, Stepper, Switch } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import { FONT_SIZE, type Preferences, type SettingsDraft } from '../types';
export function TranslationSection({draft,onChange,preferences,onPreference}:{draft:SettingsDraft;onChange:(d:SettingsDraft)=>void;preferences:Preferences;onPreference:<K extends keyof Preferences>(k:K,v:Preferences[K])=>void}){
  const batching=llmTranslationSettings(draft.runtime);
  const setBatching=(patch:Partial<typeof batching>)=>onChange({...draft,runtime:{...draft.runtime,translation:{...batching,...patch}}});
  const feature=draft.features.find(f=>f.feature==='translate')??{feature:'translate' as const,enabled:true,modelId:null,reasoning:{kind:'default' as const},activeProfileId:'default'};
  const edit=(patch:Partial<typeof feature>)=>onChange({...draft,features:[...draft.features.filter(f=>f.feature!=='translate'),{...feature,...patch}]});
  return <SettingGroup title="翻译" description="点击翻译按钮才会请求模型。按段落理解上下文，按句子保存译文；关闭阅读器会中断任务，已收到的内容保留。">
    <SettingRow label="启用翻译"><Switch label="启用翻译" checked={feature.enabled} onChange={enabled=>edit({enabled})}/></SettingRow>
    <SettingRow label="最大并发请求" description="每项任务的并发上限，同时受下方请求速率约束。限流时整个任务冷却、单请求探测恢复；已完成句子不重复发送。"><Stepper label="翻译最大并发" value={draft.runtime.concurrency} min={1} max={12} onChange={concurrency=>onChange({...draft,runtime:{...draft.runtime,concurrency}})}/></SettingRow>
    <SettingRow label="大模型每批句数" description="同页相邻内容合并请求，仍按句子返回和保存。数量越大，请求越少，首批等待可能更久。"><Stepper label="大模型每批句数" value={batching.batchSentences} min={1} max={64} onChange={batchSentences=>setBatching({batchSentences})}/></SettingRow>
    <SettingRow label="每批原文字符上限" description="与句数限制同时生效；还会依据输出上限缩小批次，单个完整句子不会被截断。"><Stepper label="每批原文字符上限" value={batching.batchCharacters} min={500} max={12000} step={500} onChange={batchCharacters=>setBatching({batchCharacters})}/></SettingRow>
    <SettingRow label="每分钟请求上限" description="每项大模型翻译任务均匀发送，包括重试；遇到限流会进一步降速。并非账户总额度，其他任务和应用仍会占用接口额度。保存后新启动或继续任务生效。"><Stepper label="每分钟请求上限" value={batching.requestsPerMinute} min={1} max={120} onChange={requestsPerMinute=>setBatching({requestsPerMinute})}/></SettingRow>
    <SettingRow label="翻译模型"><Select label="翻译模型" value={feature.modelId??'default'} options={[{value:'default',label:'使用默认模型'},...draft.models.map(m=>({value:m.id,label:m.label||m.modelId}))]} onChange={modelId=>edit({modelId:modelId==='default'?null:modelId})}/></SettingRow>
    <SettingRow label="默认翻译到" description="用于之后启动的论文和选区翻译，立即保存。选区悬浮窗可单独选择语言；不影响讨论回答语言或已有译文。"><Select label="默认翻译到" value={preferences.translationLanguage} options={TRANSLATION_LANGUAGES} onChange={v=>onPreference('translationLanguage',v)}/></SettingRow>
    <SettingRow label="译文字号跟随阅读字号"><Switch label="译文字号跟随阅读字号" checked={preferences.translationFontSize===null} onChange={follow=>onPreference('translationFontSize',follow?null:preferences.uiFontSize)}/></SettingRow>
    {preferences.translationFontSize!==null&&<SettingRow label="译文字号"><Stepper label="译文字号" value={preferences.translationFontSize} min={FONT_SIZE.min} max={FONT_SIZE.max} onChange={v=>onPreference('translationFontSize',v)}/></SettingRow>}
  </SettingGroup>;
}
