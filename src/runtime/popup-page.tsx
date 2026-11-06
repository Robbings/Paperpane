import { useState } from 'react';
import { browser } from 'wxt/browser';
import { PopupView } from '@/ui/popup/PopupView';
import { useBrowserEntry } from './use-browser-entry';
import { useLocalPreferences } from './use-local-preferences';
import { useModelSettings } from './use-model-settings';
import { usePopupData } from './use-popup-data';
import { useUpdate } from './use-update';
import { GUIDE_URL, markOnboarding } from './onboarding';

export function LivePopupPage() {
  const preferences = useLocalPreferences(), model = useModelSettings(), entry = useBrowserEntry();
  const data=usePopupData(), update=useUpdate();
  const latest=update.state?.available&&!update.state.dismissed?update.state.latest:undefined;
  const [error, setError] = useState<string>();
  const open = (path: string) => { void browser.tabs.create({ url:new URL(path,browser.runtime.getURL('/')).href }).catch(() => setError('无法打开页面，请重试。')); };
  return <PopupView activeTab={data.activeTab}
    onOpenInReader={tabId => { void browser.runtime.sendMessage({ type:'OPEN_TAB_PDF',tabId }).then(result => { if(!result?.ok)setError(result?.error??'无法打开 PDF。'); }).catch(()=>setError('无法打开 PDF。')); }}
    onAllowFileAccess={()=>open('/reader.html?open=file')}
    onOpenFileAccessSettings={()=>{void browser.tabs.create({url:`chrome://extensions/?id=${browser.runtime.id}`}).catch(()=>setError('请在浏览器的扩展管理页打开纸间的详情。'));}}
    autoOpenPdf={entry.settings.autoOpenPdf} onAutoOpenPdf={value=>void entry.save({autoOpenPdf:value})}
    showPdfButtons={entry.settings.showPdfButtons} onShowPdfButtons={value=>void entry.save({showPdfButtons:value})}
    error={entry.error??error??data.error??model.error} recent={data.recent} recentState={data.recentState}
    onOpenRecent={id=>open(`/reader.html?documentId=${encodeURIComponent(id)}`)}
    onOpenLibrary={()=>open('/library.html')} onOpenFile={()=>open('/reader.html?open=file')}
    onOpenSettings={section=>open(`/options.html${section?'#'+section:''}`)}
    setupNeeded={!model.loading&&!model.settings.models.length&&!model.settings.translationApis?.length}
    onOpenGuide={()=>{void markOnboarding({welcomed:true}).catch(()=>{});open(GUIDE_URL);}}
    update={latest&&update.state?{version:latest.version,current:update.state.current}:undefined}
    onOpenUpdate={()=>open('/options.html#about')} onDismissUpdate={()=>latest&&update.dismiss(latest.version)}
    status={{...model.status,local:preferences.state.local==='failed'?'failed':model.status.local}}/>;
}
