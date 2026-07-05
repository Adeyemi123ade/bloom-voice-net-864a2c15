// Supabase Auth "Send Email" webhook — renders a branded template and sends
// it directly via Resend. Verifies the request using Supabase's own Standard
// Webhooks signature (the secret shown when you create/edit the Send Email
// Hook in Authentication → Hooks), NOT any third-party relay.
//
// Previously this project routed through a Lovable-platform relay
// (verifying with LOVABLE_API_KEY and dispatching via a queue + Lovable's
// email API). That extra hop was a recurring source of silent failures —
// zero visibility when the relay/queue broke, with no error surfaced
// anywhere. This sends synchronously and always writes an email_send_log
// row, so a failure is always visible in that table immediately.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
}

const SITE_NAME = 'ChiChat'
const ROOT_DOMAIN = 'kajolacooperative.com'
const SENDER_DOMAIN = 'notify.kajolacooperative.com'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface SendEmailHookPayload {
  user: {
    id: string
    email: string
    user_metadata?: Record<string, unknown>
  }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Invalid request' }, 405)

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!hookSecret || !resendApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Missing required secret(s) for auth-email-hook')
    return json({ error: 'Server configuration error' }, 500)
  }

  const rawBody = await req.text()
  const headers = Object.fromEntries(req.headers)

  let data: SendEmailHookPayload
  try {
    const wh = new Webhook(hookSecret)
    data = wh.verify(rawBody, headers) as SendEmailHookPayload
  } catch (err) {
    console.error('Webhook signature verification failed', err)
    return json({ error: 'Invalid signature' }, 401)
  }

  const { user, email_data } = data
  const emailType = email_data.email_action_type
  const recipientEmail = (user.email || '').trim().toLowerCase()

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const messageId = crypto.randomUUID()

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', emailType)
    return json({ error: `Unknown email type: ${emailType}` }, 400)
  }

  const meta = (user.user_metadata || {}) as Record<string, unknown>
  const rawName = String(meta.full_name || meta.name || meta.display_name || '').trim()
  const firstName = rawName ? rawName.split(/\s+/)[0] : ''
  const firstNameCap = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : ''

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: recipientEmail,
    confirmationUrl: email_data.redirect_to || `https://${ROOT_DOMAIN}`,
    token: email_data.token,
    email: recipientEmail,
    newEmail: recipientEmail,
    firstName: firstNameCap,
  }

  let html: string
  try {
    html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  } catch (err) {
    console.error('Template render failed', emailType, err)
    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: `Render failed: ${String(err).slice(0, 900)}`,
    })
    return json({ error: 'Failed to render email' }, 500)
  }

  const sendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${SITE_NAME} <noreply@${SENDER_DOMAIN}>`,
      to: [recipientEmail],
      subject: EMAIL_SUBJECTS[emailType] || 'Notification',
      html,
    }),
  })

  if (!sendResp.ok) {
    const errText = await sendResp.text()
    console.error('Resend send failed', sendResp.status, errText)
    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: `Resend ${sendResp.status}: ${errText.slice(0, 900)}`,
    })
    return json({ error: 'Failed to send email' }, 500)
  }

  await admin.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipientEmail,
    status: 'sent',
  })

  return json({ success: true })
})
