import { useState } from 'react';
import { Button } from '@/ui/components';
import { GuideTour, type GuideStep } from '@/ui/onboarding/GuideTour';
import { WelcomeDialog } from '@/ui/onboarding/WelcomeDialog';

// 组件目录里的首次使用：欢迎弹窗，和指向本页几个按钮的引导。

const steps: GuideStep[] = [
  { target: 'demo-welcome', title: '欢迎弹窗', text: '安装后第一次打开阅读器、文献库或设置时出现一次。' },
  { target: 'demo-guide', title: '配置引导', text: '压暗页面，只亮出要讲的控件，旁边一张说明卡片。方向键翻页，Esc 退出。' },
  { target: 'nav-gallery', title: '找不到目标时', text: '要讲的控件不在页面上时，卡片放在中间，只留遮罩。' },
];

export function OnboardingDemo() {
  const [welcome, setWelcome] = useState(false);
  const [guide, setGuide] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button data-tour="demo-welcome" onClick={() => setWelcome(true)}>
        欢迎弹窗
      </Button>
      <Button data-tour="demo-guide" onClick={() => setGuide(true)}>
        配置引导
      </Button>
      <WelcomeDialog
        open={welcome}
        onClose={() => setWelcome(false)}
        onStart={() => {
          setWelcome(false);
          setGuide(true);
        }}
      />
      {guide && <GuideTour steps={steps} onClose={() => setGuide(false)} finalAction={{ label: '去添加模型服务', onAction: () => {} }} />}
    </div>
  );
}
