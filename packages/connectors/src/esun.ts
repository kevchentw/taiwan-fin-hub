import { z } from "zod";

export const esunConfigSchema = z.object({
  userId: z.string().min(1).optional(),      // 身分證字號 / 統一編號 (loginform:custid)
  account: z.string().min(1).optional(),     // 使用者名稱 (loginform:name)
  password: z.string().min(1).optional(),    // 使用者密碼 (loginform:pxsswd)
  sessionCookies: z.string().optional(),     // JSON-serialized cookies, encrypted at rest
  sessionExpiresAt: z.string().optional(),   // ISO timestamp
  lookbackMonths: z.coerce.number().int().min(1).max(24).optional()
});

export type EsunConfig = z.infer<typeof esunConfigSchema>;

export function parseEsunConfig(config: unknown) {
  return esunConfigSchema.parse(config);
}
