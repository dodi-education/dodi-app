-- Development seed: an active invite code for local registration in invite mode.
INSERT INTO public.invite_codes (id, code, is_active, max_uses, note, created_at, updated_at) VALUES ('c9ddf365-c462-49a3-841a-8ed43e958f73', 'DODI-BETA', true, NULL, 'Seeded dev invite code', '2026-09-08 14:21:21.866913+00', '2026-09-08 14:21:21.866913+00') ON CONFLICT DO NOTHING;
