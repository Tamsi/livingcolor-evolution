import type { AuditReport, KnowledgeItem, SkillAuditContext } from '@curator/core';
import {
  buildRecommendations,
  computeSkillScore,
  detectIssues,
  filterKnowledgeForSkill,
} from '@curator/core';
import type { SkillAuditorPort } from '@curator/core';

export class SkillAuditor implements SkillAuditorPort {
  auditAll(skills: SkillAuditContext[], knowledge: KnowledgeItem[]): AuditReport[] {
    return skills.map((skill) => {
      const relevant = filterKnowledgeForSkill(knowledge, skill.name);
      const issues = detectIssues(skill, relevant);
      const score = computeSkillScore(skill, issues);
      return {
        skill: skill.name,
        score,
        issues,
        recommendations: buildRecommendations(issues),
      };
    });
  }
}
