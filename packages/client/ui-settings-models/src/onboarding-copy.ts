/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-13.1'

/** The complete editable internal-testing notice in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '内测声明',
    body: 'Eleven Views Harness 是基于开源 DeepSeek Harness 开发者预览版打造的 Eleven Views 品牌发行版。核心插件与基础 API 仍可能快速迭代。\n\n请选择模型提供商和工作区，然后开始构建。',
    continueLabel: '继续',
  },
  en: {
    title: 'Internal Testing Notice',
    body: 'Eleven Views Harness is an Eleven Views branded distribution of the open-source DeepSeek Harness developer preview. Core plugins and foundational APIs may continue to evolve rapidly.\n\nChoose a model provider and workspace, then start building.',
    continueLabel: 'Continue',
  },
} as const
