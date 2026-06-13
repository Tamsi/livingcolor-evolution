import { Buffer } from 'node:buffer';
import type {
  PluginLockBumpConfig,
  PluginLockBumpPort,
  PluginLockBumpRequest,
  PullRequestResult,
} from '@curator/core';

type FetchImpl = typeof fetch;

interface GitHubRefResponse {
  object: {
    sha: string;
  };
}

interface GitHubContentResponse {
  sha: string;
}

interface GitHubPullRequestResponse {
  html_url: string;
  number: number;
}

export class GitHubPluginLockBumpService implements PluginLockBumpPort {
  constructor(
    private readonly config: PluginLockBumpConfig,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  async create(request: PluginLockBumpRequest): Promise<PullRequestResult | null> {
    if (request.dryRun || !this.config.token) {
      return null;
    }

    const branch = `curator/skills-lock-${request.resolvedCommit.slice(0, 8)}`;
    const apiBase = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`;
    const token = this.config.token;

    const baseRef = await this.githubRequest<GitHubRefResponse>(
      `${apiBase}/git/ref/heads/${this.config.baseBranch}`,
      token,
    );

    await this.githubRequest(`${apiBase}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha,
      }),
    });

    const lockPath = encodePath(this.config.lockPath);
    const existingLock = await this.githubRequest<GitHubContentResponse>(
      `${apiBase}/contents/${lockPath}?ref=${encodeURIComponent(this.config.baseBranch)}`,
      token,
    );

    await this.githubRequest(`${apiBase}/contents/${lockPath}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'chore: bump livingcolor skills lock',
        content: Buffer.from(buildLockContent(request), 'utf8').toString('base64'),
        branch,
        sha: existingLock.sha,
      }),
    });

    const pr = await this.githubRequest<GitHubPullRequestResponse>(`${apiBase}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: `Bump LivingColor skills to ${request.skillsRef}`,
        head: branch,
        base: this.config.baseBranch,
        body: buildPrBody(request),
      }),
    });

    return { url: pr.html_url, branch, number: pr.number };
  }

  private async githubRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API ${String(response.status)} for ${url}: ${text}`);
    }

    return (await response.json()) as T;
  }
}

function buildLockContent(request: PluginLockBumpRequest): string {
  return `${JSON.stringify(
    {
      repo: request.skillsRepo,
      ref: request.skillsRef,
      resolvedCommit: request.resolvedCommit,
      bundle: request.bundle,
      skills: request.skills,
      updatedBy: 'livingcolor-evolution',
    },
    null,
    2,
  )}\n`;
}

function buildPrBody(request: PluginLockBumpRequest): string {
  return [
    '## Summary',
    '',
    `- Bump \`livingcolor.skills.lock.json\` to \`${request.skillsRef}\`.`,
    `- Pin \`${request.skillsRepo}\` at \`${request.resolvedCommit}\`.`,
    '',
    '## Test plan',
    '',
    '- Validate the updated lock file is the only plugin change.',
    '- Run the LivingColor plugin skill contract checks.',
  ].join('\n');
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
