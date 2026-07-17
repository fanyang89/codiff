import { createDefaultConfig } from './config/defaults.ts';
import type { CodiffConfig } from './config/types.ts';
import type {
  CodiffLaunchOptions,
  CodiffPreferences,
  DiffImageContentRequest,
  DiffSectionContentRequest,
  ReviewSource,
} from './types.ts';

type WebSession = {
  config: CodiffConfig;
  launchOptions: CodiffLaunchOptions;
};

const request = async <Result>(path: string, body?: unknown): Promise<Result> => {
  const response = await fetch(path, {
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Codiff request failed with status ${response.status}.`);
  }
  return response.json() as Promise<Result>;
};

const disabled = async (): Promise<never> => {
  throw new Error('This operation is unavailable in read-only web mode.');
};

const noopSubscription = () => () => {};

export const installWebClient = () => {
  document.documentElement.setAttribute('data-codiff-platform', 'web');
  let sessionPromise: Promise<WebSession> | null = null;
  let config = createDefaultConfig();
  const configListeners = new Set<(nextConfig: CodiffConfig) => void>();
  const getSession = () => {
    sessionPromise ??= request<WebSession>('/api/session').then((session) => {
      config = session.config;
      return session;
    });
    return sessionPromise;
  };
  const updateSettings = (settings: Partial<CodiffConfig['settings']>) => {
    config = {
      ...config,
      settings: { ...config.settings, ...settings },
    };
    for (const listener of configListeners) {
      listener(config);
    }
  };

  const codiff: Window['codiff'] = {
    askReviewAssistant: disabled,
    completePlan: disabled,
    createWalkthroughCommit: disabled,
    decreaseCodeFontSize: async () => {
      updateSettings({ codeFontSize: Math.max(10, config.settings.codeFontSize - 1) });
    },
    getAgentSkillStatus: async () => ({ installed: false, path: '' }),
    getConfig: async () => (await getSession()).config,
    getDiffImageContent: (body: DiffImageContentRequest) => request('/api/diff/image', body),
    getDiffSectionContent: (body: DiffSectionContentRequest) => request('/api/diff/section', body),
    getFeatureFlags: async () => ({ planSharing: false, walkthroughSharing: false }),
    getGitIdentity: disabled,
    getLaunchOptions: async () => (await getSession()).launchOptions,
    getMarkdownDocument: disabled,
    getNarrativeWalkthrough: async () => ({
      reason: 'Walkthroughs are unavailable in read-only web mode.',
      status: 'unavailable',
    }),
    getPlanReview: async () => null,
    getPreferences: async () => ({ ...(await getSession()).config.settings }),
    getRepositoryHistory: (limit?: number, source?: ReviewSource) =>
      request('/api/repository/history', { limit, source }),
    getRepositoryState: (source?: ReviewSource) => request('/api/repository/state', { source }),
    getTerminalHelperStatus: async () => ({ command: 'codiff', installed: true, path: '' }),
    increaseCodeFontSize: async () => {
      updateSettings({ codeFontSize: Math.min(32, config.settings.codeFontSize + 1) });
    },
    installAgentSkill: disabled,
    installTerminalHelper: disabled,
    isWindowFullScreen: async () => false,
    markPlanReady: disabled,
    onConfigChanged: (callback) => {
      configListeners.add(callback);
      return () => configListeners.delete(callback);
    },
    onCopyPendingCommentsRequest: noopSubscription,
    onFindInDiffs: noopSubscription,
    onMarkdownDocumentChanged: noopSubscription,
    onPlanCloseRequested: noopSubscription,
    onRefreshRequest: noopSubscription,
    onRepositoryChanged: noopSubscription,
    onWalkthroughCommitOutput: noopSubscription,
    onWalkthroughProgress: noopSubscription,
    onWindowFullScreenChanged: noopSubscription,
    openConfigFile: disabled,
    openFile: disabled,
    resetCodeFontSize: async () => {
      updateSettings({ codeFontSize: 13 });
    },
    saveMarkdownDocument: disabled,
    savePlanReview: disabled,
    setDiffStyle: async (diffStyle: CodiffPreferences['diffStyle']) => {
      updateSettings({ diffStyle });
    },
    setShowOutdated: async (showOutdated: boolean) => {
      updateSettings({ showOutdated });
    },
    setWordWrap: async (wordWrap: boolean) => {
      updateSettings({ wordWrap });
    },
    sharePlan: disabled,
    shareWalkthrough: disabled,
    showInFolder: disabled,
    submitPullRequestComment: disabled,
    submitPullRequestReview: disabled,
    updateWalkthroughCommitMessage: disabled,
  };

  window.codiff = codiff;
};
