-- PostgreSQL bounds regular-expression repetitions at 255. Keep the object-key
-- character policy in the regex and enforce the 1,024-character limit directly.
alter table book_assets
  drop constraint if exists book_assets_object_key_check;

alter table book_assets
  add constraint book_assets_object_key_check check (
    char_length(object_key) between 1 and 1024
    and object_key ~ '^[a-z0-9][a-z0-9._/-]*$'
    and object_key !~ '(^|/)\.\.(/|$)'
    and object_key !~ '//'
  );
