import { z } from "zod";

export const MAX_CONTENT_LENGTH = 16 * 1024; // 16 384 bytes

export const PublishInputSchema = z.object({
  content: z
    .string()
    .min(1)
    .max(MAX_CONTENT_LENGTH)
    .describe("The shell script to publish."),
  visibility: z
    .enum(["public", "private"])
    .optional()
    .describe(
      "'private' (default) for an unguessable 22-char URL; 'public' for a short 4-char URL."
    ),
  expires: z
    .enum(["1h", "24h", "1run", "never"])
    .optional()
    .describe("'24h' default. '1run' makes the URL work exactly once."),
});
