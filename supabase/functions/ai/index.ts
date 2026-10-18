// The AI coach included with Premium: the app sends an OpenAI-style chat request (messages and
// tools); this checks the plan and the credit, forwards it to OpenRouter with the server's key
// (never in the app), charges the real cost to the user's AI credit and returns the reply.
// Variables: OPENROUTER_API_KEY, optional AI_MODEL (default below) and EUR_PER_USD (cost rate).
// The model set in the admin panel (public.app_settings, key ai_model) wins over AI_MODEL.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { upstreamBody } from './upstream.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) return json({ error: 'The included AI is not set up on this server yet.' }, 503);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  // Health data consent withdrawn (DECISIONS 81): nothing goes to the AI provider. When the
  // consent cannot be checked, nothing goes either (fail closed, DECISIONS 86).
  const consent = await admin.rpc('health_consent_of', { p_user: user.id });
  if (consent.error || typeof consent.data !== 'boolean')
    return json(
      { error: 'Your health data consent could not be checked. Try again in a moment.' },
      503,
    );
  if (!consent.data) return json({ error: 'Your health data consent is withdrawn.' }, 403);

  const plan = await admin.rpc('plan_of', { p_user: user.id });
  if (plan.data !== 'premium') return json({ error: 'The included AI is part of Premium.' }, 403);
  const credit = await admin.rpc('ai_refresh_credit', { p_user: user.id });
  const balance = Number(credit.data ?? 0);
  if (credit.error || balance <= 0)
    return json(
      { error: 'Your AI credit for this month is used up.', balance_micros: balance },
      402,
    );

  let body: { messages?: unknown[]; tools?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return json({ error: 'bad request' }, 400);

  // Set in the admin panel (AI tab); otherwise the AI_MODEL variable, otherwise the default.
  const setting = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'ai_model')
    .is('deleted_at', null)
    .maybeSingle();
  const model =
    (setting.data?.value as string | undefined) || Deno.env.get('AI_MODEL') || DEFAULT_MODEL;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'X-Title': 'FFT',
    },
    // Health data: no identifier, and only providers that keep nothing (see upstreamBody).
    body: JSON.stringify(upstreamBody(model, body.messages, body.tools)),
  });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(reply?.error?.message ?? `AI error ${res.status}`);
    // No provider of this model promises not to keep the data: the model must change (admin panel).
    if (/data policy|no endpoints found/i.test(message))
      return json(
        {
          error:
            'The AI coach model has no provider that keeps your data private. The admin must choose another model.',
        },
        502,
      );
    return json({ error: message }, 502);
  }

  // OpenRouter reports the real cost of the request in US dollars.
  const usage = reply.usage ?? {};
  const eurPerUsd = Number(Deno.env.get('EUR_PER_USD') || '0.92');
  const costMicros = Math.ceil(Number(usage.cost ?? 0) * eurPerUsd * 1_000_000);
  const left = await admin.rpc('ai_charge', {
    p_user: user.id,
    p_model: String(reply.model ?? model),
    p_prompt: Number(usage.prompt_tokens ?? 0),
    p_completion: Number(usage.completion_tokens ?? 0),
    p_cost_micros: costMicros,
  });

  return json({
    choices: reply.choices ?? [],
    balance_micros: Number(left.data ?? balance - costMicros),
  });
});
