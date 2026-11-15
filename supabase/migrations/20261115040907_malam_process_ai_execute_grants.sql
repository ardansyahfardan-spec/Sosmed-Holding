-- Remove inherited PUBLIC execution on the internal AI worker.
REVOKE EXECUTE ON FUNCTION private.malam_process_ai(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.malam_process_ai(uuid) TO authenticated;