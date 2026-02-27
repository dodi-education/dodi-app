-- Add language column to profiles for per-profile locale in kid view
-- reverse: ALTER TABLE public.profiles DROP COLUMN language;

ALTER TABLE public.profiles ADD COLUMN language text NOT NULL DEFAULT 'en';
