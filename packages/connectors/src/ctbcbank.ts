import { z } from "zod";

export const ctbcbankConfigSchema = z.object({
  userId: z.string().min(1).optional(),
  account: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  sessionCookies: z.string().optional(),
  sessionExpiresAt: z.string().optional(),
  lookbackMonths: z.coerce.number().int().min(1).max(6).optional()
});

export type CtbcbankConfig = z.infer<typeof ctbcbankConfigSchema>;

export function parseCtbcbankConfig(config: unknown): CtbcbankConfig {
  return ctbcbankConfigSchema.parse(config);
}
