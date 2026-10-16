-- feedback_message_images: the one image a parent can attach to a feedback
-- message (usually a screenshot of a bug, or of the content they flag).
--
-- Plaintext like the message itself: the parent sends it to the operator on
-- purpose, staff view it in the ops console and the platform attaches it to
-- the operator email. The clients re-encode every image to a JPEG of at most
-- 2048 px on its longest side before sending (which also drops EXIF data such
-- as a photo's location); the platform accepts JPEG, PNG or WebP, checked by
-- the file's own magic bytes, up to 2 MiB.
--
-- A table of its own rather than columns on feedback_messages keeps the bytes
-- out of every inbox list query, and the primary key on the message id keeps
-- it at one image per message. The image goes with its message (and so with
-- the sending account).

CREATE TABLE public.feedback_message_images (
  feedback_message_id uuid NOT NULL PRIMARY KEY
    REFERENCES public.feedback_messages(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  image_bytes bytea NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT feedback_message_images_content_type_check
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT feedback_message_images_byte_size_check
    CHECK (byte_size BETWEEN 1 AND 2097152),
  CONSTRAINT feedback_message_images_byte_size_matches_check
    CHECK (octet_length(image_bytes) = byte_size)
);

ALTER TABLE public.feedback_message_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view images of own feedback messages" ON public.feedback_message_images
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.feedback_messages f
    WHERE f.id = feedback_message_images.feedback_message_id
      AND f.account_id = app.current_account_id()
  ));
CREATE POLICY "Users can attach images to own feedback messages" ON public.feedback_message_images
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.feedback_messages f
    WHERE f.id = feedback_message_images.feedback_message_id
      AND f.account_id = app.current_account_id()
  ));

COMMENT ON TABLE public.feedback_message_images IS
  'The optional image attached to a feedback message (one per message). Plaintext by design, like the message.';
COMMENT ON COLUMN public.feedback_message_images.content_type IS
  'image/jpeg, image/png or image/webp, as detected from the bytes (never SVG).';
COMMENT ON COLUMN public.feedback_message_images.byte_size IS
  'Size of image_bytes, at most 2 MiB.';

-- reverse:
-- DROP TABLE public.feedback_message_images;
