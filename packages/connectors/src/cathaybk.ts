import { z } from "zod";

export const cathaybkConfigSchema = z.object({
  userId: z.string().min(1).optional(),
  account: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  sessionCookies: z.string().optional(),
  sessionExpiresAt: z.string().optional(),
  lookbackMonths: z.coerce.number().int().min(1).max(24).optional()
});

export type CathaybkConfig = z.infer<typeof cathaybkConfigSchema>;

export function parseCathaybkConfig(config: unknown): CathaybkConfig {
  return cathaybkConfigSchema.parse(config);
}
