-- Phase B / C scaffolding: planned send date for the marketing calendar.
-- Operator sets this on the brief form; calendar groups campaigns by it.
-- The actual schedule lives in dotdigital after push — this is MARK's
-- planning view.

alter table email_campaigns
  add column planned_send_at timestamptz;

create index email_campaigns_planned_send_idx
  on email_campaigns(planned_send_at)
  where planned_send_at is not null;
