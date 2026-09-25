-- Supabase's `rls_auto_enable()` event-trigger helper (it switches on RLS for new tables) is only
-- meant to run from its event trigger. Nobody needs to call it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
