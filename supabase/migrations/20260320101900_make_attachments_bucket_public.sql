-- Make attachments bucket public so getPublicUrl works
UPDATE storage.buckets SET public = true WHERE id = 'attachments';
