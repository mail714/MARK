-- Stores per-email verification status from ZeroBounce. Kept as a jsonb
-- map ({ "office@school.uk": "valid" }) so re-running verification updates
-- in place. Push-to-dotdigital reads this to filter out invalid / risky
-- emails before they hit a live address book.

alter table prospects add column email_statuses jsonb not null default '{}';
alter table prospects add column emails_verified_at timestamptz;

create index prospects_emails_verified_idx
  on prospects (emails_verified_at)
  where emails_verified_at is not null;
