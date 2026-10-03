-- A migrated file's storage key is the key the object has in the bucket, where
-- scripts/publii/upload.mjs wrote every migrated file below `migration/`. The
-- import used to write the site's old `/media/` path instead, which names no
-- object. Uploads already carry the bucket's key and are left alone.
UPDATE "media"
SET "storage_key" = 'migration/' || substring("storage_key" from char_length('media/') + 1)
WHERE "storage_key" LIKE 'media/%';
