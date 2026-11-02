export const noModel = '还没有设置翻译模型。';
export const removedEngine = '之前选择的翻译引擎已移除，请重新选择。';
export const networkFailure = '网络请求失败';

/** Keep transport diagnostics in the task record. Only show the actionable cause in the reader. */
export function translationProblem(
  raw: string,
  engine?: string,
): { message: string; section?: 'models' | 'translation' } {
  if (raw.includes(networkFailure) || raw.includes('网络连接失败或响应中断'))
    return { message: networkFailure };
  if (raw === noModel || raw === '所选模型不存在或模型 ID 为空')
    return { message: noModel, section: 'models' };
  if (raw === removedEngine || raw.includes('翻译服务已被移除'))
    return { message: removedEngine, section: 'translation' };
  if (/HTTP 40[13]\b|invalid_api_key|authentication_error|permission_denied/i.test(raw))
    return {
      message: 'API 密钥无效或没有访问权限。',
      section: engine?.startsWith('mt:') ? 'translation' : 'models',
    };
  if (/密钥|接口地址|协议|模型关联的接口|请在模型设置|此 AI 功能已在设置中关闭/.test(raw))
    return {
      message: raw,
      section: engine?.startsWith('mt:') || raw.startsWith('请先在设置中填写 ') ? 'translation' : 'models',
    };
  return { message: raw };
}
