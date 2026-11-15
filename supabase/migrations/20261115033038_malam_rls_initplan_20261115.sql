-- Avoid re-evaluating auth.uid() for each row in the Malam message insert policy.
alter policy "Malam members send to their channel"
  on public.malam_messages
  with check ((user_id = (select auth.uid())) and private.malam_can_write_message(room_id, channel));
