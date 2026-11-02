import type { GuideStep } from '@/ui/onboarding/GuideTour';
import type { SettingsSection } from './types';

/** The setup guide on the settings page, in the order a new reader needs things. */
export function setupGuide(go: (section: SettingsSection) => void): GuideStep[] {
  return [
    {
      target: 'add-provider',
      prepare: () => go('models'),
      title: '先添加模型服务',
      text: '选择一个供应商，填写 API 密钥，再添加要用的模型。解释、提问、概览和大模型翻译都要用到它。',
    },
    {
      target: 'default-model',
      prepare: () => go('models'),
      title: '选好默认模型',
      text: '没有单独指定模型的功能都用它。下面几项可以给提问、解释、概览和图像识别分别指定。',
    },
    {
      target: 'paper-engine',
      prepare: () => go('translation'),
      title: '选择翻译引擎',
      text: '翻译本页和全文用哪个引擎：大模型译得更通顺，翻译服务更快、更便宜。划选翻译可以在下一行单独设置。',
    },
    {
      target: 'add-translator',
      prepare: () => go('translation'),
      title: '添加翻译服务（可选）',
      text: '谷歌翻译免费版不需要密钥，添加后就能用；DeepL、微软等服务需要填写密钥。',
    },
    {
      target: 'translate-to',
      prepare: () => go('translation'),
      title: '翻译到哪种语言',
      text: '新的翻译默认译成这里选的语言，阅读时也可以临时更改。',
    },
    {
      target: 'auto-translate',
      prepare: () => go('translation'),
      title: '自动翻译',
      text: '可以在添加或打开论文时自动翻译全文。这会请求模型或翻译服务，可能产生费用，默认关闭。',
    },
    {
      target: 'webdav',
      prepare: () => go('sync'),
      title: '同步与备份（可选）',
      text: '连接 WebDAV 后，可以在多台设备之间同步文献库和批注，或者只做云备份。',
    },
  ];
}
