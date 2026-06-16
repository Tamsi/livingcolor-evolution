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

const EXPECTED_SKILLS = [
  'ticket-analyst',
  'code-architect',
  'qa-reviewer',
  'security-auditor',
  'sprint-reporter',
];

export class GitHubPluginLockBumpService implements PluginLockBumpPort {
  constructor(
    private readonly config: PluginLockBumpConfig,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  async create(request: PluginLockBumpRequest): Promise<PullRequestResult | null> {
    validatePluginLockBumpRequest(request);

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

function validatePluginLockBumpRequest(request: PluginLockBumpRequest): void {
  if (request.skillsRepo !== 'Tamsi/livingcolor-skills') {
    throw new Error('Invalid skillsRepo: expected Tamsi/livingcolor-skills');
  }

  if (isMovingOrBranchLikeRef(request.skillsRef)) {
    throw new Error('Invalid skillsRef: expected an immutable tag-like ref');
  }

  if (!/^[0-9a-f]{40}$/.test(request.resolvedCommit)) {
    throw new Error('Invalid resolvedCommit: expected a lowercase 40-character SHA');
  }

  if (request.bundle !== 'code-review-pipeline') {
    throw new Error('Invalid bundle: expected code-review-pipeline');
  }

  if (!Array.isArray(request.skills) || request.skills.length === 0) {
    throw new Error('Invalid skills: expected a non-empty skills array');
  }

  if (request.skills.some((skill) => typeof skill !== 'string' || skill.trim() === '')) {
    throw new Error('Invalid skills: expected non-empty string values');
  }

  if (
    request.skills.length !== EXPECTED_SKILLS.length ||
    EXPECTED_SKILLS.some((skill, index) => request.skills[index] !== skill)
  ) {
    throw new Error(`Invalid skills: expected ${EXPECTED_SKILLS.join(', ')}`);
  }
}

function isMovingOrBranchLikeRef(ref: string): boolean {
  const trimmedRef = ref.trim();

  if (trimmedRef === '' || trimmedRef !== ref) {
    return true;
  }

  const lowerRef = trimmedRef.toLowerCase();

  if (['main', 'master', 'develop', 'dev'].includes(lowerRef)) {
    return true;
  }

  if (lowerRef.startsWith('refs/heads/')) {
    return true;
  }

  return trimmedRef.includes('/') && !lowerRef.startsWith('refs/tags/');
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
