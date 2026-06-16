import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import type { PluginLockBumpRequest } from '@curator/core';
import { GitHubPluginLockBumpService } from '../plugin-lock-bump.js';

const request: PluginLockBumpRequest = {
  skillsRepo: 'Tamsi/livingcolor-skills',
  skillsRef: 'v0.2.0',
  resolvedCommit: '0123456789abcdef0123456789abcdef01234567',
  bundle: 'code-review-pipeline',
  skills: ['ticket-analyst', 'code-architect', 'qa-reviewer', 'security-auditor', 'sprint-reporter'],
  dryRun: false,
};

const config = {
  token: 'github-token',
  owner: 'Tamsi',
  repo: 'livingcolor-plugin',
  baseBranch: 'main',
  lockPath: 'livingcolor.skills.lock.json',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GitHubPluginLockBumpService', () => {
  it('creates a branch, updates only the skills lock, and opens a pull request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'base-branch-sha' } }))
      .mockResolvedValueOnce(jsonResponse({ ref: 'refs/heads/curator/skills-lock-01234567' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'existing-lock-sha' }))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: 'new-lock-sha' } }))
      .mockResolvedValueOnce(jsonResponse({ html_url: 'https://github.com/Tamsi/livingcolor-plugin/pull/42', number: 42 }));

    const service = new GitHubPluginLockBumpService(config, fetchImpl);

    const result = await service.create(request);

    expect(result).toEqual({
      url: 'https://github.com/Tamsi/livingcolor-plugin/pull/42',
      branch: 'curator/skills-lock-01234567',
      number: 42,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.github.com/repos/Tamsi/livingcolor-plugin/git/ref/heads/main',
      'https://api.github.com/repos/Tamsi/livingcolor-plugin/git/refs',
      'https://api.github.com/repos/Tamsi/livingcolor-plugin/contents/livingcolor.skills.lock.json?ref=main',
      'https://api.github.com/repos/Tamsi/livingcolor-plugin/contents/livingcolor.skills.lock.json',
      'https://api.github.com/repos/Tamsi/livingcolor-plugin/pulls',
    ]);

    const putInit = fetchImpl.mock.calls[3]?.[1];
    expect(putInit?.method).toBe('PUT');

    const putBody = JSON.parse(String(putInit?.body)) as {
      message: string;
      branch: string;
      path: string;
      sha: string;
      content: string;
    };

    expect(putBody.message).toBe('chore: bump livingcolor skills lock');
    expect(putBody.branch).toMatch(/^curator\/skills-lock-/);
    expect(putBody.path).toBeUndefined();
    expect(putBody.sha).toBe('existing-lock-sha');

    expect(Buffer.from(putBody.content, 'base64').toString('utf8')).toBe(
      `${JSON.stringify(
        {
          repo: 'Tamsi/livingcolor-skills',
          ref: 'v0.2.0',
          resolvedCommit: '0123456789abcdef0123456789abcdef01234567',
          bundle: 'code-review-pipeline',
          skills: ['ticket-analyst', 'code-architect', 'qa-reviewer', 'security-auditor', 'sprint-reporter'],
          updatedBy: 'livingcolor-evolution',
        },
        null,
        2,
      )}\n`,
    );

    const pullRequestBody = JSON.parse(String(fetchImpl.mock.calls[4]?.[1]?.body)) as {
      title: string;
      head: string;
      base: string;
      body: string;
    };

    expect(pullRequestBody.title).toBe('Bump LivingColor skills to v0.2.0');
    expect(pullRequestBody.head).toBe('curator/skills-lock-01234567');
    expect(pullRequestBody.base).toBe('main');
    expect(pullRequestBody.body).toContain('## Summary');
    expect(pullRequestBody.body).toContain('## Test plan');
  });

  it('returns null without GitHub API calls when dry-run is requested', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const service = new GitHubPluginLockBumpService(config, fetchImpl);

    await expect(service.create({ ...request, dryRun: true })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null without GitHub API calls when no token is configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const service = new GitHubPluginLockBumpService(
      {
        owner: config.owner,
        repo: config.repo,
        baseBranch: config.baseBranch,
        lockPath: config.lockPath,
      },
      fetchImpl,
    );

    await expect(service.create(request)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['', '   ', ' v0.2.0 ', 'main', ' refs/heads/main ', 'feature/foo'])(
    'rejects moving or branch-like skills ref %s before GitHub API calls',
    async (skillsRef) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const service = new GitHubPluginLockBumpService(config, fetchImpl);

      await expect(service.create({ ...request, skillsRef })).rejects.toThrow(/skillsRef/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([
    '01234567',
    '0123456789ABCDEF0123456789ABCDEF01234567',
    '0123456789abcdef0123456789abcdef0123456g',
  ])('rejects invalid resolved commit %s before GitHub API calls', async (resolvedCommit) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const service = new GitHubPluginLockBumpService(config, fetchImpl);

    await expect(service.create({ ...request, resolvedCommit })).rejects.toThrow(/resolvedCommit/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unexpected skills before GitHub API calls', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const service = new GitHubPluginLockBumpService(config, fetchImpl);

    await expect(service.create({ ...request, skills: ['ticket-analyst'] })).rejects.toThrow(/skills/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
