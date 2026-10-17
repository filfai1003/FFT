-- AI coach consent (DECISIONS 66): before the coach sends anything, the user agrees to it on a
-- consent screen; the agreement is a row of public.consents like the health data consent
-- (granted_at, withdrawn_at, policy version), synced like the other consents.

alter table public.consents drop constraint if exists consents_type_check;
alter table public.consents
  add constraint consents_type_check check (type in ('health_data', 'analytics', 'ai_coach'));
