import pxtorem from 'postcss-pxtorem';

// The design's 16px root is 100% UI size. Convert our UI styles at build time
// so existing component proportions stay intact without zooming the document.
// PDF.js, KaTeX and document overlays retain their own coordinate systems.
export default {
  plugins: [pxtorem({
    rootValue: 16,
    propList: ['*'],
    minPixelValue: 2,
    mediaQuery: false,
    exclude: (file) => !file.replaceAll('\\', '/').includes('/src/ui/'),
    selectorBlackList: ['.pp-pdf-surface'],
  })],
};
