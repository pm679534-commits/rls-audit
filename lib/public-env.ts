import {z} from 'zod';

const url = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
}, 'Use HTTPS outside localhost');

export const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: url,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1),
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production'])
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicSiteUrl(): string {
  return url.parse(process.env.NEXT_PUBLIC_SITE_URL);
}

const publicSupabaseSchema = publicSchema.pick({NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true});
let cachedPublicSupabase: z.infer<typeof publicSupabaseSchema> | undefined;
export function getPublicSupabaseEnv() {
  return cachedPublicSupabase ??= publicSupabaseSchema.parse(process.env);
}

let cachedPublic: PublicEnv | undefined;
export function getPublicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT
  });
  if (!parsed.success) throw new Error(`Invalid public environment variables: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  return cachedPublic = parsed.data;
}
