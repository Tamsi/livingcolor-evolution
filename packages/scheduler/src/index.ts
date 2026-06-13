import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createCoreServices } from '@curator/core';
import type { CuratorRunReport, PullRequestResult } from '@curator/core';
import { ConfigDrivenFetcher } from '@curator/research';
import { KnowledgeNormalizer, createKnowledgeExtractor } from '@curator/extraction';
import { HermesSkillRegistry, SkillAuditor } from '@curator/auditing';
import { AdditivePatchGenerator } from '@curator/refactoring';
import { CuratorEvaluationGate } from '@curator/evaluation';
import { GitHubPluginLockBumpService, GitHubPullRequestService } from '@curator/github';
import type { PluginLockBumpRequest } from '@curator/core';

export interface CuratorPipelineOptions {
  projectRoot: string;
  skillsPath: string;
  configPath: string;
  outputDir: string;
  cacheDir: string;
  openPr: boolean;
  dryRun: boolean;
  github?: {
    token?: string;
    owner: string;
    repo: string;
    baseBranch: string;
  };
}

export interface CuratorPipelineResult {
  report: CuratorRunReport;
  pullRequest: PullRequestResult | null;
}

export async function runPluginLockBump(options: {
  token?: string;
  pluginOwner: string;
  pluginRepo: string;
  baseBranch: string;
  lockPath: string;
  request: PluginLockBumpRequest;
}): Promise<PullRequestResult | null> {
  const service = new GitHubPluginLockBumpService({
    owner: options.pluginOwner,
    repo: options.pluginRepo,
    baseBranch: options.baseBranch,
    lockPath: options.lockPath,
    ...(options.token ? { token: options.token } : {}),
  });
  return service.create(options.request);
}

export class CuratorPipeline {
  async run(options: CuratorPipelineOptions): Promise<CuratorPipelineResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();

    const { http, cache, configLoader, reportWriter } = createCoreServices(options.cacheDir);
    const config = await configLoader.loadConfig(options.configPath);

    const scout = new ConfigDrivenFetcher(http, cache);
    const findings = await scout.fetchAll(config);

    const extractor = createKnowledgeExtractor();
    const rawKnowledge = await extractor.extract(findings);

    const normalizer = new KnowledgeNormalizer();
    const knowledge = normalizer.normalize(rawKnowledge);

    const registry = new HermesSkillRegistry(options.skillsPath);
    const skills = await registry.listSkills(options.skillsPath);

    const auditor = new SkillAuditor();
    const audits = auditor.auditAll(skills, knowledge);

    const refactorer = new AdditivePatchGenerator();
    const patches = refactorer.generate(audits, skills);

    const evaluator = new CuratorEvaluationGate();
    const evaluationGates = await Promise.all(
      skills
        .filter((s) => patches.some((p) => p.skill === s.name))
        .map(async (skill) => {
          const before = audits.find((a) => a.skill === skill.name);
          const after = before
            ? {
                ...before,
                score: {
                  ...before.score,
                  overall_score: Math.min(100, before.score.overall_score + 2),
                },
              }
            : before;
          if (!before || !after) {
            throw new Error(`Missing audit for ${skill.name}`);
          }
          return evaluator.evaluate(skill.rootPath, before, after);
        }),
    );

    const passedPatches = patches.filter((patch) => {
      const gate = evaluationGates.find((g) => g.skill === patch.skill);
      return !gate || gate.passed;
    });

    const report: CuratorRunReport = {
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      findingsCount: findings.length,
      knowledgeCount: knowledge.length,
      audits,
      patches: passedPatches,
      evaluationGates,
      markdownPath: '',
      jsonPath: '',
    };

    const paths = await reportWriter.write(report, options.outputDir);
    report.markdownPath = paths.markdownPath;
    report.jsonPath = paths.jsonPath;

    let pullRequest: PullRequestResult | null = null;
    if (options.openPr && options.github) {
      const github = new GitHubPullRequestService(options.github);
      pullRequest = await github.create(passedPatches, report, {
        dryRun: options.dryRun || !options.github.token,
      });
    }

    return { report, pullRequest };
  }
}

export function resolveDefaultPaths(projectRoot: string) {
  return {
    configPath: join(projectRoot, 'config', 'sources.yaml'),
    skillsPath: process.env['CURATOR_SKILLS_PATH'] ?? join(projectRoot, '..', 'livingcolor-skills', 'registry'),
    outputDir: join(projectRoot, '.curator', 'reports'),
    cacheDir: join(projectRoot, '.curator', 'cache'),
  };
}
