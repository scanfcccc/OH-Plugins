export type LocaleKey = 'zh' | 'en';

const translations = {
  zh: {
    documentTitle: 'HyperFrames Studio',
    appTitle: 'HyperFrames',
    projectLabel: '项目',
    defaultProjectTitle: '新的 HyperFrames 影片',
    create: '新建',
    refresh: '刷新',
    preview: '预览',
    lint: '检查',
    render: '渲染',
    openStudio: '打开 Studio',
    renderMp4: '渲染 MP4',
    studioFrameTitle: 'HyperFrames 原版 Studio',
    hanaBarLabel: 'HyperFrames 控制栏',
    selectedProject: '项目',
    health: '环境',
    emptyTitle: '创建一个 HyperFrames 工程',
    emptyDescription: '插件会直接嵌入原版 Studio，播放、seek、时间线和快捷键都由 HyperFrames 自己提供。',
    startingStudio: '正在启动原版 Studio',
    startingStudioDetail: '预览服务启动后会自动进入全屏工作台。',
    previewRunning: '运行中',
    previewStarting: '启动中',
    previewFailed: '失败',
    previewStopped: '已停止',
    previewIdle: '未启动',
    studio: 'Studio',
    noProjectSelected: '未选择项目',
    projectRenders: '{count} 个渲染',
    noProjects: '还没有项目。',
    previewIframeTitle: 'HyperFrames Studio 预览',
    previewPlaceholder: 'HTML 合成预览',
    renderPanel: '渲染',
    format: '格式',
    quality: '质量',
    fps: 'FPS',
    qualityDraft: '草稿',
    qualityStandard: '标准',
    qualityHigh: '高质量',
    diagnostics: '诊断',
    diagnosticsProjects: '项目',
    notChecked: '尚未检查',
    outputs: '输出',
    noRenders: '还没有渲染。',
    tasks: '任务',
    noTasks: '还没有任务。',
    sizeUnknown: '大小未知',
    toastProjectCreated: '项目已创建',
    toastLintComplete: '检查完成',
    toastRenderComplete: '渲染完成',
    clipIntro: '开场',
    clipOutro: '收束',
    clipCaption: '字幕',
    clipPrompt: '提示词',
    taskTypeLint: '检查',
    taskTypeRender: '渲染',
    taskTypeTask: '任务',
    taskStatusRunning: '运行中',
    taskStatusCompleted: '已完成',
    taskStatusFailed: '失败',
    seconds: '{value}秒',
  },
  en: {
    documentTitle: 'HyperFrames Studio',
    appTitle: 'HyperFrames',
    projectLabel: 'Project',
    defaultProjectTitle: 'New HyperFrames Film',
    create: 'Create',
    refresh: 'Refresh',
    preview: 'Preview',
    lint: 'Lint',
    render: 'Render',
    openStudio: 'Open Studio',
    renderMp4: 'Render MP4',
    studioFrameTitle: 'Original HyperFrames Studio',
    hanaBarLabel: 'HyperFrames control bar',
    selectedProject: 'Project',
    health: 'Health',
    emptyTitle: 'Create a HyperFrames project',
    emptyDescription: 'The plugin embeds the original Studio directly, so playback, seek, timeline, and shortcuts stay native to HyperFrames.',
    startingStudio: 'Starting original Studio',
    startingStudioDetail: 'The fullscreen workspace opens as soon as the preview service is ready.',
    previewRunning: 'Running',
    previewStarting: 'Starting',
    previewFailed: 'Failed',
    previewStopped: 'Stopped',
    previewIdle: 'Idle',
    studio: 'Studio',
    noProjectSelected: 'No project selected',
    projectRenders: '{count} renders',
    noProjects: 'No projects yet.',
    previewIframeTitle: 'HyperFrames Studio Preview',
    previewPlaceholder: 'HTML composition preview',
    renderPanel: 'Render',
    format: 'Format',
    quality: 'Quality',
    fps: 'FPS',
    qualityDraft: 'Draft',
    qualityStandard: 'Standard',
    qualityHigh: 'High',
    diagnostics: 'Diagnostics',
    diagnosticsProjects: 'Projects',
    notChecked: 'Not checked',
    outputs: 'Outputs',
    noRenders: 'No renders.',
    tasks: 'Tasks',
    noTasks: 'No tasks.',
    sizeUnknown: 'size unknown',
    toastProjectCreated: 'Project created',
    toastLintComplete: 'Lint complete',
    toastRenderComplete: 'Render complete',
    clipIntro: 'Intro',
    clipOutro: 'Outro',
    clipCaption: 'Caption',
    clipPrompt: 'Prompt',
    taskTypeLint: 'Lint',
    taskTypeRender: 'Render',
    taskTypeTask: 'Task',
    taskStatusRunning: 'Running',
    taskStatusCompleted: 'Completed',
    taskStatusFailed: 'Failed',
    seconds: '{value}s',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const localeQueryKeys = ['hana-locale', 'locale', 'lang'];

export function detectLocale(targetWindow: Pick<Window, 'location' | 'navigator'> = window): LocaleKey {
  const params = new URLSearchParams(targetWindow.location.search);
  for (const key of localeQueryKeys) {
    const value = params.get(key);
    if (value) return resolveLocale(value);
  }

  const languages = targetWindow.navigator.languages || [];
  return resolveLocale(languages[0] || targetWindow.navigator.language || 'zh-CN');
}

export function resolveLocale(locale: string | null | undefined): LocaleKey {
  const normalized = String(locale || '').trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
}

export function htmlLangForLocale(locale: LocaleKey): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}

export function createTranslator(locale: LocaleKey): Translate {
  const dictionary = translations[locale] || translations.en;
  return (key, vars = {}) => interpolate(dictionary[key] ?? translations.en[key] ?? key, vars);
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}
