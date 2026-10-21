import type {Enums} from '@/types/database';

type Severity = Enums<'severity'>;
type Definition = {module: 'general-web' | 'nextjs' | 'supabase'; severity: Severity; scoreWeight: number; titleKey: string; descriptionKey: string; impactKey: string; fixKey: string; references: readonly string[]};

function define(id: string, module: Definition['module'], severity: Severity, scoreWeight: number, references: string[]): Definition {
  return {module, severity, scoreWeight, titleKey: `Scanner.findings.${id}.title`, descriptionKey: `Scanner.findings.${id}.description`, impactKey: `Scanner.findings.${id}.impact`, fixKey: `Scanner.findings.${id}.fix`, references};
}

export const FINDING_REGISTRY = {
  tls_invalid: define('tls_invalid', 'general-web', 'critical', 30, ['https://www.rfc-editor.org/rfc/rfc5280']),
  missing_https: define('missing_https', 'general-web', 'high', 16, ['https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security']),
  tls_expiring: define('tls_expiring', 'general-web', 'medium', 8, ['https://www.rfc-editor.org/rfc/rfc5280']),
  missing_hsts: define('missing_hsts', 'general-web', 'medium', 7, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security']),
  missing_csp: define('missing_csp', 'general-web', 'medium', 8, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP']),
  missing_frame_protection: define('missing_frame_protection', 'general-web', 'medium', 6, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors']),
  missing_content_type_options: define('missing_content_type_options', 'general-web', 'low', 4, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options']),
  weak_referrer_policy: define('weak_referrer_policy', 'general-web', 'low', 3, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy']),
  missing_permissions_policy: define('missing_permissions_policy', 'general-web', 'low', 2, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy']),
  insecure_cookie: define('insecure_cookie', 'general-web', 'high', 12, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie']),
  cookie_missing_httponly: define('cookie_missing_httponly', 'general-web', 'medium', 6, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie']),
  cookie_missing_samesite: define('cookie_missing_samesite', 'general-web', 'low', 4, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie']),
  cors_wildcard_credentials: define('cors_wildcard_credentials', 'general-web', 'low', 3, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS']),
  cors_reflected_origin: define('cors_reflected_origin', 'general-web', 'high', 12, ['https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS']),
  exposed_env_file: define('exposed_env_file', 'general-web', 'critical', 30, ['https://owasp.org/www-project-web-security-testing-guide/']),
  exposed_git: define('exposed_git', 'general-web', 'high', 18, ['https://owasp.org/www-project-web-security-testing-guide/']),
  exposed_backup: define('exposed_backup', 'general-web', 'high', 18, ['https://owasp.org/www-project-web-security-testing-guide/']),
  directory_listing: define('directory_listing', 'general-web', 'medium', 7, ['https://owasp.org/www-project-web-security-testing-guide/']),
  open_redirect: define('open_redirect', 'general-web', 'medium', 7, ['https://owasp.org/www-community/attacks/Unvalidated_Redirects_and_Forwards_Cheat_Sheet']),
  missing_security_txt: define('missing_security_txt', 'general-web', 'info', 0, ['https://www.rfc-editor.org/rfc/rfc9116']),
  mixed_content: define('mixed_content', 'general-web', 'medium', 6, ['https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content']),
  third_party_script_no_sri: define('third_party_script_no_sri', 'general-web', 'low', 4, ['https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity']),
  exposed_source_map: define('exposed_source_map', 'nextjs', 'medium', 9, ['https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps']),
  client_secret_leak: define('client_secret_leak', 'nextjs', 'critical', 32, ['https://nextjs.org/docs/app/guides/environment-variables']),
  unauthenticated_api: define('unauthenticated_api', 'nextjs', 'high', 17, ['https://nextjs.org/docs/app/building-your-application/routing/route-handlers']),
  exposed_next_data: define('exposed_next_data', 'nextjs', 'high', 13, ['https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-props']),
  vulnerable_next_version: define('vulnerable_next_version', 'nextjs', 'high', 20, ['https://github.com/vercel/next.js/security/advisories']),
  middleware_auth_signal: define('middleware_auth_signal', 'nextjs', 'info', 0, ['https://nextjs.org/docs/app/building-your-application/authentication']),
  service_role_leak: define('service_role_leak', 'supabase', 'critical', 45, ['https://supabase.com/docs/guides/api/api-keys']),
  anon_readable_sensitive_table: define('anon_readable_sensitive_table', 'supabase', 'high', 22, ['https://supabase.com/docs/guides/database/postgres/row-level-security']),
  anon_readable_table: define('anon_readable_table', 'supabase', 'info', 0, ['https://supabase.com/docs/guides/database/postgres/row-level-security']),
  write_policy_manual: define('write_policy_manual', 'supabase', 'info', 0, ['https://supabase.com/docs/guides/database/postgres/row-level-security']),
  exposed_sensitive_rpc: define('exposed_sensitive_rpc', 'supabase', 'medium', 8, ['https://supabase.com/docs/guides/api/securing-your-api']),
  public_storage_bucket: define('public_storage_bucket', 'supabase', 'info', 0, ['https://supabase.com/docs/guides/storage/buckets/fundamentals']),
  public_storage_sensitive_path: define('public_storage_sensitive_path', 'supabase', 'high', 16, ['https://supabase.com/docs/guides/storage/security/access-control']),
  open_signups: define('open_signups', 'supabase', 'info', 0, ['https://supabase.com/docs/guides/auth/general-configuration']),
  auth_autoconfirm: define('auth_autoconfirm', 'supabase', 'medium', 7, ['https://supabase.com/docs/guides/auth/general-configuration']),
  weak_auth_provider: define('weak_auth_provider', 'supabase', 'info', 0, ['https://supabase.com/docs/guides/auth/general-configuration']),
  cross_user_read: define('cross_user_read', 'supabase', 'critical', 35, ['https://supabase.com/docs/guides/database/postgres/row-level-security']),
  cross_user_manual: define('cross_user_manual', 'supabase', 'info', 0, ['https://supabase.com/docs/guides/database/postgres/row-level-security'])
} as const satisfies Record<string, Definition>;

export type FindingId = keyof typeof FINDING_REGISTRY;
