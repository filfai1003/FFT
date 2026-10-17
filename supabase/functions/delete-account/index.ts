// Deletes the signed-in user's account and ALL their data: photos and exercise images in
// Storage first, then the auth user (every table row goes with it through ON DELETE CASCADE).
// Needs the service role, so it runs here and not in the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BUCKETS = ['progress-photos', 'user-exercise-images', 'vault-files'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data } = await admin.auth.getUser(token);
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  for (const bucket of BUCKETS) {
    // Files live in "<uid>/…"; list in pages and remove them all.
    for (;;) {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
      if (!files || files.length === 0) break;
      const { error } = await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ deleted: true }), { headers: { ...cors, 'content-type': 'application/json' } });
});
