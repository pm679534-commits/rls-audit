import 'server-only';

import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import type {Locale} from '@/i18n/routing';
import en from '@/messages/en.json';
import az from '@/messages/az.json';
import {logUnexpectedError} from '@/lib/logger';

export type AppErrorCode = 'UNAUTHENTICATED' | 'EMAIL_UNVERIFIED' | 'SUSPENDED' | 'FORBIDDEN' | 'READ_ONLY' | 'NOT_FOUND' | 'CONFLICT' | 'SCAN_IN_PROGRESS' | 'DISPOSABLE_EMAIL' | 'BLOCKED_DOMAIN' | 'DOMAIN_CLAIMED' | 'INVALID_INPUT' | 'RATE_LIMITED' | 'EXTERNAL_SERVICE' | 'INTERNAL';

export class AppError extends Error {
  constructor(public readonly code: AppErrorCode, public readonly status: number, message: string, public readonly details?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthenticatedError extends AppError { constructor() { super('UNAUTHENTICATED', 401, 'Please sign in.'); } }
export class EmailUnverifiedError extends AppError { constructor() { super('EMAIL_UNVERIFIED', 403, 'Verify your email address to continue.'); } }
export class SuspendedError extends AppError { constructor() { super('SUSPENDED', 403, 'This account is suspended.'); } }
export class ForbiddenError extends AppError { constructor() { super('FORBIDDEN', 403, 'You do not have access to this resource.'); } }
export class ReadOnlyError extends AppError { constructor() { super('READ_ONLY', 403, 'Your trial or subscription has expired.'); } }
export class NotFoundError extends AppError { constructor() { super('NOT_FOUND', 404, 'Resource not found.'); } }
export class ConflictError extends AppError { constructor(message = 'This request conflicts with an existing resource.') { super('CONFLICT', 409, message); } }
export class ScanInProgressError extends AppError { constructor() { super('SCAN_IN_PROGRESS', 409, 'A scan is already in progress.'); } }
export class DisposableEmailError extends AppError { constructor() { super('DISPOSABLE_EMAIL', 400, 'Disposable email addresses are not accepted.'); } }
export class BlockedDomainError extends AppError { constructor() { super('BLOCKED_DOMAIN', 403, 'This domain cannot be scanned.'); } }
export class DomainClaimedError extends AppError { constructor() { super('DOMAIN_CLAIMED', 409, 'This domain is already verified by another account.'); } }
export class ValidationError extends AppError { constructor(details?: Record<string, string[]>) { super('INVALID_INPUT', 400, 'Please check your input.', details); } }
export class RateLimitError extends AppError { constructor(public readonly retryAfter: number, public readonly rateHeaders?: Headers) { super('RATE_LIMITED', 429, 'Too many requests. Please try again later.'); } }
export class ExternalServiceError extends AppError { constructor() { super('EXTERNAL_SERVICE', 502, 'An external service is unavailable.'); } }

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new ValidationError(error.flatten().fieldErrors as Record<string, string[]>);
  return new AppError('INTERNAL', 500, 'Something went wrong.');
}

function publicMessage(code: AppErrorCode, locale: Locale): string {
  return (locale === 'az' ? az : en).Errors[code];
}

function publicDetails(details: Record<string, string[]> | undefined, locale: Locale) {
  return details ? Object.fromEntries(Object.keys(details).map((field) => [field, [publicMessage('INVALID_INPUT', locale)]])) : undefined;
}

export function toActionError(error: unknown, locale: Locale = 'en', event = 'server_action_failed') {
  const mapped = toAppError(error);
  const requestId = mapped.status >= 500 ? logUnexpectedError(event, error) : undefined;
  return {ok: false as const, error: {code: mapped.code, message: publicMessage(mapped.code, locale), ...(requestId ? {requestId} : {}), ...(mapped.details ? {details: publicDetails(mapped.details, locale)} : {}), ...(mapped instanceof RateLimitError ? {retryAfter: mapped.retryAfter} : {})}};
}

export function toRouteError(error: unknown, headers?: HeadersInit, locale: Locale = 'en', event = 'route_failed') {
  const mapped = toAppError(error);
  const responseHeaders = new Headers(headers);
  const requestId = mapped.status >= 500 ? logUnexpectedError(event, error) : undefined;
  if (requestId) responseHeaders.set('X-Request-ID', requestId);
  if (mapped instanceof RateLimitError) {
    mapped.rateHeaders?.forEach((value, key) => responseHeaders.set(key, value));
    responseHeaders.set('Retry-After', String(mapped.retryAfter));
  }
  return NextResponse.json({error: {code: mapped.code, message: publicMessage(mapped.code, locale), ...(requestId ? {requestId} : {}), ...(mapped.details ? {details: publicDetails(mapped.details, locale)} : {})}}, {status: mapped.status, headers: responseHeaders});
}
