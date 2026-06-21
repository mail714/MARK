-- Phase B push 4: template selection on campaigns.
-- Operator picks the template, AI fills slots, MARK renders the final HTML
-- into email_campaigns.html_body before push to dotdigital.

alter table email_campaigns
  add column template_key text not null default 'simple-hero';
