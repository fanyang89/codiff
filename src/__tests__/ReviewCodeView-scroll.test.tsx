/**
 * @vitest-environment jsdom
 */

import type { CodeViewItem } from '@pierre/diffs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, test, vi } from 'vite-plus/test';
import { ReviewCodeView } from '../app/components/ReviewCodeView.tsx';
import { defaultKeymap } from '../config/defaults.ts';
import type { ReviewComment } from '../lib/app-types.ts';
import type { ChangedFile, CommitMetadata, ReviewSource } from '../types.ts';

const codeViewMock = vi.hoisted(() => ({
  scrollTo: vi.fn(),
}));

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react');

  return {
    CodeView: React.forwardRef(function MockCodeView(
      props: {
        className?: string;
        items: Array<CodeViewItem<unknown>>;
        onScroll?: (scrollTop: number, viewer: unknown) => void;
        renderAnnotation?: (
          annotation: { metadata: unknown },
          item: CodeViewItem<unknown>,
        ) => React.ReactNode;
        renderCustomHeader?: (item: CodeViewItem<unknown>) => React.ReactNode;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      const itemsRef = React.useRef(props.items);
      const renderedIdsRef = React.useRef(new Set<string>());
      const scrollAttemptByIdRef = React.useRef(new Map<string, number>());
      const scrollTopRef = React.useRef(0);
      itemsRef.current = props.items;

      const viewer = React.useMemo(
        () => ({
          getRenderedItems: () =>
            itemsRef.current
              .filter((item) => renderedIdsRef.current.has(item.id))
              .map((item) => ({
                element: document.createElement('div'),
                id: item.id,
                instance: {},
                item,
                type: item.type,
                version: item.version,
              })),
          getScrollTop: () => scrollTopRef.current,
          getTopForItem: (id: string) => {
            const index = itemsRef.current.findIndex((item) => item.id === id);
            return index === -1 ? undefined : index * 200 + 20;
          },
        }),
        [],
      );

      React.useImperativeHandle(
        ref,
        () => ({
          clearSelectedLines: () => {},
          getInstance: () => viewer,
          scrollTo: (target: { behavior?: string; id: string; offset?: number }) => {
            codeViewMock.scrollTo(target);
            const attempts = (scrollAttemptByIdRef.current.get(target.id) ?? 0) + 1;
            scrollAttemptByIdRef.current.set(target.id, attempts);
            const itemTop = viewer.getTopForItem(target.id) ?? 0;
            scrollTopRef.current = Math.max(0, itemTop - (target.offset ?? 0));
            if (attempts >= 2) {
              renderedIdsRef.current.add(target.id);
            }
            props.onScroll?.(scrollTopRef.current, viewer);
          },
        }),
        [props, viewer],
      );

      return React.createElement(
        'div',
        { className: props.className },
        props.items.map((item) =>
          React.createElement(
            'div',
            { key: item.id },
            props.renderCustomHeader ? props.renderCustomHeader(item) : null,
            'annotations' in item && Array.isArray(item.annotations)
              ? item.annotations.map((annotation, index) =>
                  React.createElement(
                    React.Fragment,
                    { key: index },
                    props.renderAnnotation?.(annotation, item),
                  ),
                )
              : null,
          ),
        ),
      );
    }),
    WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

const createChangedFile = (path: string) =>
  ({
    fingerprint: `${path}:1`,
    path,
    sections: [
      {
        binary: false,
        id: `${path}:unstaged`,
        kind: 'unstaged',
        patch: `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-old\n+new\n`,
      },
    ],
    status: 'modified',
  }) satisfies ChangedFile;

const createChangedFileWithPatch = (path: string, patch: string) =>
  ({
    fingerprint: `${path}:1`,
    path,
    sections: [
      {
        binary: false,
        id: `${path}:unstaged`,
        kind: 'unstaged',
        patch,
      },
    ],
    status: 'modified',
  }) satisfies ChangedFile;

const source = { type: 'working-tree' } satisfies ReviewSource;
const commitSource = { ref: 'abc1234', type: 'commit' } satisfies ReviewSource;
const commitMetadata = {
  author: {
    date: '2026-01-01T12:00:00Z',
    email: 'author@example.com',
    name: 'Author',
  },
  body: '',
  committer: {
    date: '2026-01-01T12:00:00Z',
    email: 'committer@example.com',
    name: 'Committer',
  },
  files: [
    {
      additions: 1,
      binary: false,
      deletions: 1,
      path: 'src/second.ts',
      status: 'modified' as const,
    },
    {
      additions: 1,
      binary: false,
      deletions: 0,
      path: 'src/hidden.ts',
      status: 'modified' as const,
    },
  ],
  parents: ['parent-sha'],
  ref: 'abc1234',
  refs: ['main'],
  shortRef: 'abc1234',
  signature: {
    status: 'N',
  },
  stats: {
    additions: 2,
    binaryFiles: 0,
    deletions: 1,
    files: 2,
    renamedFiles: 0,
  },
  subject: 'Commit subject',
  trailers: [],
} satisfies CommitMetadata;

const waitFor = async (assertion: () => void) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
};

test('reload scroll target is retried until the selected item renders', async () => {
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          agentId="codex"
          agentLabel="Codex"
          collapsed={new Set()}
          comments={[]}
          commitMetadata={null}
          diffStyle="split"
          files={[createChangedFile('src/first.ts'), createChangedFile('src/second.ts')]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          hunkNavigation={null}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={() => {}}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={{ path: 'src/second.ts', request: 1 }}
          searchQuery=""
          selectedPath="src/second.ts"
          showWhitespace={false}
          source={source}
          viewed={{}}
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    await waitFor(() => {
      expect(codeViewMock.scrollTo).toHaveBeenCalledTimes(2);
    });
    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        behavior: 'instant',
        id: 'diff:src/second.ts:unstaged',
        type: 'item',
      }),
    );
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('commit metadata file rows scroll to the matching diff', async () => {
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          agentId="codex"
          agentLabel="Codex"
          collapsed={new Set()}
          comments={[]}
          commitMetadata={commitMetadata}
          diffStyle="split"
          files={[createChangedFile('src/first.ts'), createChangedFile('src/second.ts')]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          hunkNavigation={null}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={() => {}}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={null}
          searchQuery=""
          selectedPath={null}
          showWhitespace={false}
          source={commitSource}
          viewed={{}}
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    const fileButtons = [...container.querySelectorAll<HTMLButtonElement>('.commit-details-file')];
    const fileButton = fileButtons.find((button) => button.textContent?.includes('src/second.ts'));
    if (!fileButton) {
      throw new Error('Expected commit metadata file button.');
    }
    const hiddenFileButton = fileButtons.find((button) =>
      button.textContent?.includes('src/hidden.ts'),
    );
    if (!hiddenFileButton) {
      throw new Error('Expected hidden commit metadata file button.');
    }

    expect(hiddenFileButton.disabled).toBe(true);
    expect(hiddenFileButton.title).toContain('hidden by current filters');

    await act(async () => {
      hiddenFileButton.click();
    });

    expect(codeViewMock.scrollTo).not.toHaveBeenCalled();

    await act(async () => {
      fileButton.click();
    });

    expect(codeViewMock.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: 'smooth',
        id: 'diff:src/second.ts:unstaged',
        type: 'item',
      }),
    );
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('hunk navigation skips stale requests when the review view remounts', async () => {
  codeViewMock.scrollTo.mockClear();

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ReviewCodeView
          activeSearchMatch={null}
          agentId="codex"
          agentLabel="Codex"
          collapsed={new Set()}
          comments={[]}
          commitMetadata={null}
          diffStyle="unified"
          files={[createChangedFile('src/first.ts')]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          hunkNavigation={{ direction: 1, request: 1 }}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={() => {}}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={null}
          searchQuery=""
          selectedPath={null}
          showWhitespace={false}
          source={source}
          viewed={{}}
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(codeViewMock.scrollTo).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(
        <ReviewCodeView
          activeSearchMatch={null}
          agentId="codex"
          agentLabel="Codex"
          collapsed={new Set()}
          comments={[]}
          commitMetadata={null}
          diffStyle="unified"
          files={[createChangedFile('src/first.ts')]}
          focusCommentId={null}
          focusCommentRequest={0}
          forceExpandedPaths={new Set()}
          gitIdentity={null}
          hunkNavigation={{ direction: 1, request: 2 }}
          isPullRequest={false}
          itemVersionByPath={{}}
          keymap={defaultKeymap}
          loadingSectionIds={new Set()}
          onAskCodex={() => {}}
          onCreateComment={() => {}}
          onDeleteComment={() => {}}
          onLoadSection={() => {}}
          onOpenFile={() => {}}
          onSelectPathFromScroll={() => {}}
          onSubmitComment={() => {}}
          onToggleCollapsed={() => {}}
          onToggleViewed={() => {}}
          onUpdateComment={() => {}}
          scrollTarget={null}
          searchQuery=""
          selectedPath={null}
          showWhitespace={false}
          source={source}
          viewed={{}}
          walkthroughNotes={new Map()}
          wordWrap={false}
        />,
      );
    });

    expect(codeViewMock.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'diff:src/first.ts:unstaged',
        lineNumber: 1,
        side: 'additions',
        type: 'line',
      }),
    );
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('hunk navigation orders deletion comments before added rows in unified changes', async () => {
  codeViewMock.scrollTo.mockClear();

  const file = createChangedFileWithPatch(
    'src/first.ts',
    'diff --git a/src/first.ts b/src/first.ts\n@@ -1 +1 @@\n-old\n+new\n',
  );
  const comment = {
    body: 'Needs work.',
    filePath: 'src/first.ts',
    id: 'comment-1',
    lineNumber: 1,
    sectionId: 'src/first.ts:unstaged',
    side: 'deletions',
  } satisfies ReviewComment;

  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  const render = (request: number) =>
    root?.render(
      <ReviewCodeView
        activeSearchMatch={null}
        agentId="codex"
        agentLabel="Codex"
        collapsed={new Set()}
        comments={[comment]}
        commitMetadata={null}
        diffStyle="unified"
        files={[file]}
        focusCommentId={null}
        focusCommentRequest={0}
        forceExpandedPaths={new Set()}
        gitIdentity={null}
        hunkNavigation={{ direction: 1, request }}
        isPullRequest={false}
        itemVersionByPath={{}}
        keymap={defaultKeymap}
        loadingSectionIds={new Set()}
        onAskCodex={() => {}}
        onCreateComment={() => {}}
        onDeleteComment={() => {}}
        onLoadSection={() => {}}
        onOpenFile={() => {}}
        onSelectPathFromScroll={() => {}}
        onSubmitComment={() => {}}
        onToggleCollapsed={() => {}}
        onToggleViewed={() => {}}
        onUpdateComment={() => {}}
        scrollTarget={null}
        searchQuery=""
        selectedPath={null}
        showWhitespace={false}
        source={source}
        viewed={{}}
        walkthroughNotes={new Map()}
        wordWrap={false}
      />,
    );

  try {
    await act(async () => {
      root = createRoot(container);
      render(0);
    });
    codeViewMock.scrollTo.mockClear();

    await act(async () => {
      render(1);
    });

    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lineNumber: 1,
        side: 'deletions',
        type: 'line',
      }),
    );

    await act(async () => {
      render(2);
    });

    expect(codeViewMock.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lineNumber: 1,
        side: 'additions',
        type: 'line',
      }),
    );
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});

test('Enter on a focused review control is not converted into a hunk comment', async () => {
  codeViewMock.scrollTo.mockClear();

  const onCreateComment = vi.fn();
  const onOpenFile = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;

  const render = (request: number) =>
    root?.render(
      <ReviewCodeView
        activeSearchMatch={null}
        agentId="codex"
        agentLabel="Codex"
        collapsed={new Set()}
        comments={[]}
        commitMetadata={null}
        diffStyle="unified"
        files={[createChangedFile('src/first.ts')]}
        focusCommentId={null}
        focusCommentRequest={0}
        forceExpandedPaths={new Set()}
        gitIdentity={null}
        hunkNavigation={{ direction: 1, request }}
        isPullRequest={false}
        itemVersionByPath={{}}
        keymap={defaultKeymap}
        loadingSectionIds={new Set()}
        onAskCodex={() => {}}
        onCreateComment={onCreateComment}
        onDeleteComment={() => {}}
        onLoadSection={() => {}}
        onOpenFile={onOpenFile}
        onSelectPathFromScroll={() => {}}
        onSubmitComment={() => {}}
        onToggleCollapsed={() => {}}
        onToggleViewed={() => {}}
        onUpdateComment={() => {}}
        scrollTarget={null}
        searchQuery=""
        selectedPath={null}
        showWhitespace={false}
        source={source}
        viewed={{}}
        walkthroughNotes={new Map()}
        wordWrap={false}
      />,
    );

  try {
    await act(async () => {
      root = createRoot(container);
      render(0);
    });
    await act(async () => {
      render(1);
    });

    const openButton = container.querySelector<HTMLButtonElement>('.codiff-open-button');
    if (!openButton) {
      throw new Error('Expected the open file button.');
    }

    openButton.focus();
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    });
    openButton.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onCreateComment).not.toHaveBeenCalled();
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  }
});
