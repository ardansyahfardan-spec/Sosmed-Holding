-- Allow Workspace Crew and admins to upload segment logos into the public game-assets bucket.
-- Existing public-read policy is intentionally reused; app_state stores only public URLs.
DROP POLICY IF EXISTS "Workspace members upload segment logos" ON storage.objects;
CREATE POLICY "Workspace members upload segment logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'arena-game-images'
  AND (storage.foldername(name))[1] = 'segments'
  AND (
    private.is_ghoustory_workspace_member()
    OR private.is_ghoustory_app_admin()
  )
);
