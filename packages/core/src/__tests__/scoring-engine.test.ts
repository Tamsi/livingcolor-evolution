import { describe, expect, it } from 'vitest';
import { computeSkillScore, detectIssues, filterKnowledgeForSkill, knowledgeId } from '../application/scoring-engine.js';
import type { KnowledgeItem, SkillAuditContext } from '../domain/types.js';

describe('scoring-engine', () => {
  const skill: SkillAuditContext = {
    name: 'code-architect',
    tags: ['architecture', 'code-review'],
    prompt: '# Code Architect\n\nReview process step by step. Anti-patterns. Adapt to the project stack from context.',
    version: '2.0.0',
    hasTests: true,
    hasExamples: true,
    rootPath: '/tmp/code-architect',
  };

  const knowledge: KnowledgeItem[] = [
    {
      id: 'k1',
      category: 'architecture',
      role: 'code-architect',
      practice: 'Use constructor injection with readonly properties',
      importance: 'high',
      confidence: 0.9,
      sources: ['https://martinfowler.com/feed.atom'],
    },
    {
      id: 'k2',
      category: 'security',
      role: 'security-auditor',
      practice: 'Rotate signing keys regularly',
      importance: 'high',
      confidence: 0.9,
      sources: ['https://owasp.org/feed.xml'],
    },
  ];

  it('filters knowledge by skill name (role routing)', () => {
    const filtered = filterKnowledgeForSkill(knowledge, skill.name);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.role).toBe('code-architect');
  });

  it('detects missing practices', () => {
    const issues = detectIssues(skill, [knowledge[0]!]);
    expect(issues.some((i) => i.type === 'missing')).toBe(true);
  });

  it('computes overall score', () => {
    const issues = detectIssues(skill, [knowledge[0]!]);
    const score = computeSkillScore(skill, issues);
    expect(score.overall_score).toBeGreaterThan(0);
    expect(score.overall_score).toBeLessThanOrEqual(100);
  });

  it('builds stable knowledge ids from role and category', () => {
    expect(knowledgeId('Some practice', 'code-architect', 'architecture')).toBe(
      knowledgeId('some  practice', 'code-architect', 'architecture'),
    );
  });
});
