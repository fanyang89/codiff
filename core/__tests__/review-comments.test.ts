import { expect, test } from 'vite-plus/test';
import type { ReviewComment } from '../lib/app-types.ts';
import {
  getReviewCommentsFromState,
  getVisibleReviewComments,
  toPullRequestReviewComment,
} from '../lib/review-comments.ts';
import type { RepositoryState } from '../types.ts';

const createReviewComment = (overrides: Partial<ReviewComment>): ReviewComment => ({
  body: 'A comment.',
  filePath: 'src/a.ts',
  id: 'github:1',
  lineNumber: 5,
  sectionId: 'src/a.ts:pull-request:1',
  side: 'additions',
  ...overrides,
});

const createPullRequestState = (): RepositoryState => ({
  branch: null,
  files: [
    {
      fingerprint: 'fingerprint',
      path: 'src/a.ts',
      sections: [
        {
          binary: false,
          id: 'src/a.ts:pull-request:1',
          kind: 'pull-request',
          patch: '',
        },
      ],
      status: 'modified',
    },
  ],
  generatedAt: 0,
  launchPath: '/repo',
  reviewComments: [
    {
      author: { login: 'reviewer' },
      body: 'Outdated comment.',
      filePath: 'src/a.ts',
      id: 'github:1',
      isOutdated: true,
      lineNumber: 5,
      side: 'additions',
    },
    {
      author: { login: 'reviewer' },
      body: 'Current comment.',
      filePath: 'src/a.ts',
      id: 'github:2',
      lineNumber: 6,
      side: 'additions',
    },
  ],
  root: '/repo',
  source: {
    type: 'pull-request',
    url: 'https://github.com/nkzw-tech/codiff/pull/1',
  },
});

test('getReviewCommentsFromState carries the outdated flag through to review comments', () => {
  const comments = getReviewCommentsFromState(createPullRequestState());

  expect(comments).toHaveLength(2);
  expect(comments.find((comment) => comment.id === 'github:1')?.isOutdated).toBe(true);
  expect(comments.find((comment) => comment.id === 'github:2')?.isOutdated).toBeUndefined();
});

test('getReviewCommentsFromState carries GitLab discussion metadata through to review comments', () => {
  const state = createPullRequestState();
  state.reviewComments = [
    {
      author: { login: 'reviewer' },
      body: 'Resolvable comment.',
      canResolveThread: true,
      filePath: 'src/a.ts',
      id: 'gitlab:1',
      lineNumber: 5,
      side: 'additions',
      threadId: 'discussion-1',
    },
    {
      author: { login: 'reviewer' },
      body: 'Resolved comment.',
      filePath: 'src/a.ts',
      id: 'gitlab:2',
      isThreadResolved: true,
      lineNumber: 6,
      side: 'additions',
      threadId: 'discussion-2',
    },
  ];
  const comments = getReviewCommentsFromState(state);

  expect(comments.find((comment) => comment.id === 'gitlab:1')).toMatchObject({
    canResolveThread: true,
    threadId: 'discussion-1',
  });
  expect(comments.find((comment) => comment.id === 'gitlab:2')).toMatchObject({
    isThreadResolved: true,
    threadId: 'discussion-2',
  });
});

test('getReviewCommentsFromState preserves file-level GitLab anchors', () => {
  const state = createPullRequestState();
  state.reviewComments = [
    {
      anchor: 'file',
      author: { login: 'reviewer' },
      body: 'Review the file as a whole.',
      filePath: 'src/a.ts',
      id: 'gitlab:file',
    },
  ];

  expect(getReviewCommentsFromState(state)).toEqual([
    expect.objectContaining({
      anchor: 'file',
      body: 'Review the file as a whole.',
      filePath: 'src/a.ts',
      id: 'gitlab:file',
      isReadOnly: true,
      sectionId: 'src/a.ts:pull-request:1',
    }),
  ]);
});

test('getVisibleReviewComments hides outdated comments unless they are shown', () => {
  const comments = [
    createReviewComment({ id: 'github:1', isOutdated: true }),
    createReviewComment({ id: 'github:2' }),
  ];

  expect(getVisibleReviewComments(comments, false).map((comment) => comment.id)).toEqual([
    'github:2',
  ]);
  expect(getVisibleReviewComments(comments, true).map((comment) => comment.id)).toEqual([
    'github:1',
    'github:2',
  ]);
});

test('getVisibleReviewComments keeps user-authored comments that are never outdated', () => {
  const comments = [createReviewComment({ id: 'draft', isReadOnly: false })];

  expect(getVisibleReviewComments(comments, false)).toHaveLength(1);
});

test('serializes file-level thread replies without inventing line metadata', () => {
  expect(
    toPullRequestReviewComment(
      createReviewComment({
        anchor: 'file',
        body: 'Reply in the existing discussion.',
        lineNumber: undefined,
        side: undefined,
        threadId: 'discussion-1',
      }),
    ),
  ).toEqual({
    anchor: 'file',
    body: 'Reply in the existing discussion.',
    filePath: 'src/a.ts',
    threadId: 'discussion-1',
  });
});
