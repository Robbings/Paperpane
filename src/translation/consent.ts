const key = 'paperpane-translation-cost-accepted-v1';

export function translationCostAccepted() {
  return localStorage.getItem(key) === 'yes';
}

/** Shared by selections, page/document tasks and the automatic translation setting on this installation. */
function acceptTranslationCost(detail = '翻译会将论文中的文字发送给你选择的翻译服务或模型，可能产生费用。') {
  if (translationCostAccepted()) return true;
  if (!window.confirm(detail + '\n确认后，本机后续翻译不再提示费用。')) return false;
  localStorage.setItem(key, 'yes');
  return true;
}
export async function allowTranslation(signal?: AbortSignal, detail?: string) {
  if (translationCostAccepted()) return true;
  return navigator.locks.request(key, { signal }, () => acceptTranslationCost(detail));
}
