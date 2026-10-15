-- Sign in with Google was tried and taken back (email + password stays): the table that held the
-- MCP sign-in requests waiting on Google is not used any more.
drop table if exists public.oauth_pending;
