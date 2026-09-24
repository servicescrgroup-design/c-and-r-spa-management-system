-- Calling a schema-qualified function (e.g. app.post_pos_transaction) requires
-- USAGE on the schema itself, not just EXECUTE on the function. Without this,
-- every RPC call from the app (booking, POS posting) fails with
-- "permission denied for schema app".
grant usage on schema app to anon, authenticated;
