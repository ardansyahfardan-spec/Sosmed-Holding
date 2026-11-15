-- Harden Malam RPC execution context without changing game logic.
-- All application objects referenced by these functions are schema-qualified.
ALTER FUNCTION public.malam_get_state(uuid) SET search_path = '';
ALTER FUNCTION public.malam_process_ai(uuid) SET search_path = '';
ALTER FUNCTION private.malam_get_state(uuid) SET search_path = '';
ALTER FUNCTION private.malam_get_vote_tally(uuid) SET search_path = '';
ALTER FUNCTION private.malam_process_ai(uuid) SET search_path = '';

-- The public wrapper performs the room-membership check. The internal worker
-- must not be callable by anonymous users directly.
REVOKE EXECUTE ON FUNCTION private.malam_process_ai(uuid) FROM anon;