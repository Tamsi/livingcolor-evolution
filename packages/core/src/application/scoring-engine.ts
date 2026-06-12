import { createHash } from 'node:crypto';
import type { AuditIssue, KnowledgeItem, SkillAuditContext, SkillScore } from '../domain/types.js';

const DIMENSION_WEIGHTS = {
  prompt_quality: 0.2,
  reasoning_quality: 0.15,
  tool_usage: 0.1,
  architecture_guidance: 0.2,
  evaluation_coverage: 0.15,
  guardrails: 0.1,
  maintainability: 0.1,
} as const;

export function knowledgeId(raw: string, role: string, category: string): string {
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  return createHash('sha256').update(`${role}:${category}:${normalized}`).digest('hex').slice(0, 16);
}

export function filterKnowledgeForSkill(
  knowledge: KnowledgeItem[],
  skillName: string,
): KnowledgeItem[] {
  return knowledge.filter((item) => item.role === skillName);
}

export function detectIssues(
  skill: SkillAuditContext,
  knowledge: KnowledgeItem[],
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const promptLower = skill.prompt.toLowerCase();

  for (const item of knowledge) {
    const keywords = extractKeywords(item.practice);
    const covered = keywords.some((kw) => promptLower.includes(kw));
    if (!covered && item.importance !== 'low') {
      issues.push({
        type: 'missing',
        severity: item.importance,
        message: `Prompt does not cover: ${item.practice.slice(0, 120)}`,
        knowledgeId: item.id,
        recommendation: `Add guidance about: ${item.practice.slice(0, 200)}`,
      });
    }
  }

  return issues;
}

function extractKeywords(practice: string): string[] {
  const words = practice
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  return [...new Set(words)].slice(0, 5);
}

export function computeSkillScore(skill: SkillAuditContext, issues: AuditIssue[]): SkillScore {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const highCount = issues.filter((i) => i.severity === 'high').length;
  const missingCount = issues.filter((i) => i.type === 'missing').length;

  const dimensions = {
    prompt_quality: clamp(100 - missingCount * 8),
    reasoning_quality: clamp(scoreByKeywords(skill.prompt, ['process', 'review', 'check', 'step'])),
    tool_usage: clamp(skill.prompt.includes('required_tools') ? 80 : 70),
    architecture_guidance: clamp(100 - highCount * 10 - criticalCount * 15),
    evaluation_coverage: clamp(skill.hasTests ? 90 : 40),
    guardrails: clamp(scoreByKeywords(skill.prompt, ['do not', 'anti-pattern', 'severity', 'when not'])),
    maintainability: clamp(scoreByKeywords(skill.prompt, ['context', 'adapt', 'output format']) + (skill.hasExamples ? 10 : 0)),
  };

  const overall = Math.round(
    Object.entries(DIMENSION_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + dimensions[key as keyof typeof dimensions] * weight,
      0,
    ),
  );

  return {
    skill: skill.name,
    dimensions,
    overall_score: overall,
    recorded_at: new Date().toISOString(),
  };
}

function scoreByKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k)).length;
  return clamp(50 + hits * 12);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildRecommendations(issues: AuditIssue[]): string[] {
  return issues
    .filter((i) => i.recommendation)
    .map((i) => i.recommendation as string)
    .slice(0, 10);
}
