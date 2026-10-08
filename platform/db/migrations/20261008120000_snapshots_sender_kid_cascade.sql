-- game_snapshots.sender_kid_id: delete received copies with the sender kid.
--
-- A snapshot a kid sends to a friend is stored in the friend family's account
-- as an origin = 'received' row whose sender_kid_id points at the sender kid.
-- The FK used ON DELETE SET NULL, but game_snapshots_received_sender_check
-- requires sender_kid_id on every received row, so deleting the sender kid (or
-- the sender's whole account, which cascades to its kids) failed with a CHECK
-- violation as soon as a friend held one of its snapshots.
--
-- Received rows cannot outlive their sender anyway: the receiving client
-- verifies the sealed envelope against the sender kid's signing key, which is
-- joined from that kid row. So the copies now go with the sender (as the
-- friendship itself does). Only received rows carry sender_kid_id, so own and
-- autosave rows are untouched.

ALTER TABLE public.game_snapshots
  DROP CONSTRAINT game_snapshots_sender_kid_id_fkey;

ALTER TABLE public.game_snapshots
  ADD CONSTRAINT game_snapshots_sender_kid_id_fkey FOREIGN KEY (sender_kid_id)
    REFERENCES public.kids(id) ON DELETE CASCADE;

-- reverse:
-- ALTER TABLE public.game_snapshots
--   DROP CONSTRAINT game_snapshots_sender_kid_id_fkey;
--
-- ALTER TABLE public.game_snapshots
--   ADD CONSTRAINT game_snapshots_sender_kid_id_fkey FOREIGN KEY (sender_kid_id)
--     REFERENCES public.kids(id) ON DELETE SET NULL;
