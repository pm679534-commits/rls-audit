'use server';

import {Text} from '@react-email/components';
import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {getSiteUrl} from '@/lib/config';
import {getCompanyDetails} from '@/lib/config.server';
import {sendEmail} from '@/lib/email';
import {logUnexpectedError} from '@/lib/logger';
import {createAdminClient} from '@/lib/supabase/admin';
import {verifyTurnstile} from '@/lib/turnstile';
import {emailSchema, localeSchema} from '@/lib/validation';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

const schema = z.object({name: z.string().trim().min(1).max(120), email: emailSchema,
  subject: z.string().trim().min(1).max(200), body: z.string().trim().min(10).max(10000),
  locale: localeSchema, turnstileToken: z.string().max(4096).optional()});

export const sendContactMessage = createServerAction(schema, async (input, context) => {
  await verifyTurnstile(input.turnstileToken, {action: 'contact', hostname: getSiteUrl().hostname});
  const {data, error} = await createAdminClient().from('contact_messages').insert({
    user_id: context?.user.id ?? null, name: input.name, email: input.email,
    subject: input.subject, body: input.body
  }).select('id').single();
  if (error || !data) throw new Error('Contact message could not be saved');
  const copy = (input.locale === 'az' ? az : en).Marketing.contact;
  try {
    await sendEmail({to: getCompanyDetails().email, locale: input.locale,
      subject: `${copy.emailSubject}: ${input.subject}`, preview: copy.emailPreview,
      replyTo: input.email, idempotencyKey: `contact-${data.id}`,
      content: <><Text>{copy.emailIntro}</Text><Text>{input.name} · {input.email}</Text>
        <Text>{input.subject}</Text><Text style={{whiteSpace: 'pre-wrap'}}>{input.body}</Text></>});
  } catch (error) { logUnexpectedError('contact_notification_failed', error); }
  return {sent: true};
}, {access: 'optional', rateLimit: {name: 'contact', limit: 5, windowSeconds: 3600}});
