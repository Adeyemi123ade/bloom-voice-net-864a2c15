INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public read on email-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');