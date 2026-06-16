import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginLockBumpRequest, PullRequestResult } from '@curator/core';
import { runPluginLockBump } from '../index.js';

const githubMocks = vi.hoisted(() => ({
  create: vi.fn(),
  GitHubPluginLockBumpService: vi.fn(),
}));

vi.mock('@curator/github', () => ({
  GitHubPluginLockBumpService: githubMocks.GitHubPluginLockBumpService,
}));

const request: PluginLockBumpRequest = {
  skillsRepo: 'Tamsi/livingcolor-skills',
  skillsRef: 'v0.2.0',
  resolvedCommit: '0123456789abcdef0123456789abcdef01234567',
  bundle: 'code-review-pipeline',
  skills: ['ticket-analyst', 'code-architect', 'qa-reviewer', 'security-auditor', 'sprint-reporter'],
  dryRun: false,
};

describe('runPluginLockBump', () => {
  beforeEach(() => {
    githubMocks.create.mockReset();
    githubMocks.GitHubPluginLockBumpService.mockReset();
    githubMocks.GitHubPluginLockBumpService.mockImplementation(() => ({
      create: githubMocks.create,
    }));
  });

  it('opens a plugin lock bump pull request', async () => {
    const pullRequest: PullRequestResult = {
      url: 'https://github.com/Tamsi/livingcolor-plugin/pull/42',
      branch: 'curator/skills-lock-01234567',
      number: 42,
    };
    githubMocks.create.mockResolvedValue(pullRequest);

    const result = await runPluginLockBump({
      token: 'github-token',
      pluginOwner: 'Tamsi',
      pluginRepo: 'livingcolor-plugin',
      baseBranch: 'main',
      lockPath: 'livingcolor.skills.lock.json',
      request,
    });

    expect(githubMocks.GitHubPluginLockBumpService).toHaveBeenCalledWith({
      token: 'github-token',
      owner: 'Tamsi',
      repo: 'livingcolor-plugin',
      baseBranch: 'main',
      lockPath: 'livingcolor.skills.lock.json',
    });
    expect(githubMocks.create).toHaveBeenCalledWith(request);
    expect(result).toEqual({
      url: 'https://github.com/Tamsi/livingcolor-plugin/pull/42',
      branch: 'curator/skills-lock-01234567',
      number: 42,
    });
  });
});
