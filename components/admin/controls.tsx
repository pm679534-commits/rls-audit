'use client';

import {useState, useTransition, type FormEvent} from 'react';
import {useRouter} from '@/i18n/navigation';
import {adminMutate} from '@/lib/admin/actions';

type Value = string | number | boolean | null | undefined;
type Field = {name: string; label: string; type?: 'text' | 'number' | 'textarea' | 'select' | 'datetime-local' | 'checkbox' | 'url'; value?: Value; options?: {value: string; label: string}[]; required?: boolean; min?: number; max?: number};

export function AdminActionButton({payload, label, confirmMessage, reasonLabel, destructive = false}: {payload: Record<string, unknown>; label: string; confirmMessage?: string; reasonLabel?: string; destructive?: boolean}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  return <span className="inline-flex flex-col gap-1"><button type="button" disabled={pending} onClick={() => {
    const reason = reasonLabel ? window.prompt(reasonLabel)?.trim() : undefined;
    if (reasonLabel && (!reason || reason.length < 5)) return;
    const confirmation = confirmMessage ? window.prompt(confirmMessage) : undefined;
    if (confirmMessage && confirmation !== 'DELETE') return;
    if (reasonLabel && !window.confirm(label)) return;
    start(async () => {const result = await adminMutate({...payload, ...(confirmMessage ? {confirmation} : {}), ...(reasonLabel ? {reason} : {})}); setMessage(result.ok ? '' : result.error.message); if (result.ok) router.refresh();});
  }} className={`min-h-11 rounded-md border px-3 py-2 text-xs font-medium disabled:opacity-50 ${destructive ? 'border-destructive text-destructive hover:bg-destructive/10' : 'hover:bg-accent'}`}>{pending ? '…' : label}</button>{message && <span role="alert" className="max-w-56 text-xs text-destructive">{message}</span>}</span>;
}

export function AdminForm({kind, fixed = {}, fields, submitLabel, successLabel, confirmMessage}: {kind: string; fixed?: Record<string, unknown>; fields: Field[]; submitLabel: string; successLabel: string; confirmMessage?: string}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values: Record<string, unknown> = {...fixed, kind};
    for (const field of fields) {
      if (field.type === 'checkbox') values[field.name] = data.has(field.name);
      else if (field.type === 'datetime-local') {const raw = String(data.get(field.name) ?? ''); const date = new Date(raw); values[field.name] = raw && Number.isFinite(date.getTime()) ? date.toISOString() : raw;}
      else values[field.name] = String(data.get(field.name) ?? '');
    }
    start(async () => {const result = await adminMutate(values); setMessage(result.ok ? successLabel : result.error.message); if (result.ok) router.refresh();});
  }
  return <form onSubmit={submit} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.name} className={`block text-sm ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}><span className="mb-1 block font-medium">{field.label}</span>{field.type === 'textarea' ? <textarea name={field.name} defaultValue={String(field.value ?? '')} required={field.required} rows={4} className="w-full rounded-md border bg-background p-2" /> : field.type === 'select' ? <select name={field.name} defaultValue={String(field.value ?? '')} className="w-full rounded-md border bg-background p-2">{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" name={field.name} defaultChecked={Boolean(field.value)} className="h-5 w-5" /> : <input name={field.name} type={field.type ?? 'text'} defaultValue={field.type === 'datetime-local' && field.value ? new Date(String(field.value)).toISOString().slice(0,16) : String(field.value ?? '')} required={field.required} min={field.min} max={field.max} className="w-full rounded-md border bg-background p-2" />}</label>)}</div><div className="flex items-center gap-3"><button disabled={pending} type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? '…' : submitLabel}</button>{message && <span role="status" className="text-sm">{message}</span>}</div></form>;
}
