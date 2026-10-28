/** Translation language is independent of interface and conversation language. */
export const TRANSLATION_LANGUAGES = [
  {value:'zh-CN',label:'简体中文'}, {value:'zh-TW',label:'繁體中文'},
  {value:'en',label:'English'}, {value:'ja',label:'日本語'}, {value:'ko',label:'한국어'},
  {value:'fr',label:'Français'}, {value:'de',label:'Deutsch'}, {value:'es',label:'Español'},
  {value:'pt',label:'Português'}, {value:'it',label:'Italiano'}, {value:'ru',label:'Русский'},
  {value:'ar',label:'العربية'}, {value:'hi',label:'हिन्दी'}, {value:'id',label:'Bahasa Indonesia'},
  {value:'vi',label:'Tiếng Việt'}, {value:'tr',label:'Türkçe'},
] as const;
export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number]['value'];
export const isTranslationLanguage = (value: unknown): value is TranslationLanguage => TRANSLATION_LANGUAGES.some(x=>x.value===value);
export const translationLanguageLabel = (value: string) => TRANSLATION_LANGUAGES.find(x=>x.value===value)?.label ?? value;
