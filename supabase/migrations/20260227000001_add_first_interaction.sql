-- Add first_interaction flag to profiles
-- Tracks whether the kid has seen the initial "Now I have a voice!" greeting
-- reverse: ALTER TABLE profiles DROP COLUMN first_interaction;

ALTER TABLE profiles ADD COLUMN first_interaction boolean NOT NULL DEFAULT false;
