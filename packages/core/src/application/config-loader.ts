import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { CuratorConfig } from '../domain/types.js';
import type { ConfigLoaderPort } from '../ports/index.js';

const RoleSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rss'),
    url: z.string().url(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    type: z.literal('changelog_url'),
    url: z.string().url(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    type: z.literal('github_releases'),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected "owner/repo"'),
    confidence: z.number().min(0).max(1).optional(),
  }),
]);

const CuratorConfigSchema = z.object({
  roles: z.record(z.array(RoleSourceSchema)),
  tiers: z.object({
    tier1: z.object({ auto_apply: z.boolean() }),
    tier2: z.object({ auto_apply: z.boolean(), requires_review: z.boolean() }),
  }),
});

export class YamlConfigLoader implements ConfigLoaderPort {
  async loadConfig(configPath: string): Promise<CuratorConfig> {
    const content = await readFile(configPath, 'utf-8');
    const raw: unknown = parseYaml(content);
    return CuratorConfigSchema.parse(raw) as CuratorConfig;
  }
}
