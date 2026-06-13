import type {
  AuditReport,
  CuratorConfig,
  CuratorRunReport,
  EvaluationGate,
  GitPatch,
  KnowledgeItem,
  PluginLockBumpRequest,
  PullRequestResult,
  RawKnowledge,
  SkillAuditContext,
  SourceFinding,
} from '../domain/types.js';

export interface HttpClientPort {
  fetchText(url: string): Promise<string>;
  fetchJson<T>(url: string): Promise<T>;
}

export interface ConfigLoaderPort {
  loadConfig(configPath: string): Promise<CuratorConfig>;
}

export interface SourceFetcherPort {
  fetchAll(config: CuratorConfig): Promise<SourceFinding[]>;
}

export interface KnowledgeExtractorPort {
  extract(findings: SourceFinding[]): Promise<RawKnowledge[]>;
}

export interface KnowledgeNormalizerPort {
  normalize(raw: RawKnowledge[]): KnowledgeItem[];
}

export interface SkillAuditorPort {
  auditAll(skills: SkillAuditContext[], knowledge: KnowledgeItem[]): AuditReport[];
}

export interface PatchGeneratorPort {
  generate(reports: AuditReport[], skills: SkillAuditContext[]): GitPatch[];
}

export interface EvaluationGatePort {
  evaluate(
    skillPath: string,
    before: AuditReport,
    after: AuditReport,
  ): Promise<EvaluationGate>;
}

export interface ReportWriterPort {
  write(report: CuratorRunReport, outputDir: string): Promise<{ markdownPath: string; jsonPath: string }>;
}

export interface PullRequestPort {
  create(
    patches: GitPatch[],
    report: CuratorRunReport,
    options: { dryRun: boolean },
  ): Promise<PullRequestResult | null>;
}

export interface PluginLockBumpPort {
  create(request: PluginLockBumpRequest): Promise<PullRequestResult | null>;
}

export interface SkillRegistryPort {
  listSkills(registryPath: string): Promise<SkillAuditContext[]>;
}

export interface CachePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
