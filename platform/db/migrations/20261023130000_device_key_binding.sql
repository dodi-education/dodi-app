-- Device key binding for pairing (agents and the robot).
--
-- A pairing device sends a signature, made with its ML-DSA signing key, over
-- its device id and ML-KEM public key (@dodi/protocol/agent-key
-- signDeviceKeys). The parent compares the signing key's fingerprint; the
-- browser verifies the signature before it wraps the vault key to the KEM
-- key. Without it a server could pass the real signing key along with a KEM
-- key of its own and receive the vault key. The dodi CLI always sends it; a
-- robot whose firmware predates it may not (NULL).

ALTER TABLE public.authorized_clients
  ADD COLUMN kem_key_signature text,
  ADD CONSTRAINT authorized_clients_kem_key_signature_length_check
    CHECK (char_length(kem_key_signature) <= 8000);

COMMENT ON COLUMN public.authorized_clients.kem_key_signature IS
  'ML-DSA signature (base64url) by the device''s signing key over its device id and KEM key; verified client-side before the vault key is wrapped to it.';

-- reverse:
-- ALTER TABLE public.authorized_clients
--   DROP CONSTRAINT authorized_clients_kem_key_signature_length_check,
--   DROP COLUMN kem_key_signature;
