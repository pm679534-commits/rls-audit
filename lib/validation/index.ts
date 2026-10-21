import {z} from 'zod';
import {getDomain} from 'tldts';

export const localeSchema = z.enum(['en', 'az']);
export const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(12).max(128);
export const domainSchema = z.string().trim().toLowerCase().max(253).refine((value) =>
  Boolean(getDomain(value)) && !value.endsWith('.') && value.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)), 'Invalid domain');
export const urlSchema = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash &&
      (!url.port || url.port === (url.protocol === 'https:' ? '443' : '80')) && Boolean(getDomain(url.hostname));
  } catch { return false; }
}, 'Invalid public URL');
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
}).transform(({page, pageSize}) => ({page, pageSize, offset: (page - 1) * pageSize}));
