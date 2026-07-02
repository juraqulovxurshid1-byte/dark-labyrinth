// POST /api/delete
// Body: { token, pin }
// Returns: { success } on success
//          { error } on failure (401 / 404 / 500)
//
// GDPR Article 17 (right to erasure): a user can request deletion of their
// account. We require a valid session token AND a re-entered PIN so a
// stolen token can't be used to wipe the account.
//
// After deletion, the username is freed up for someone else to register.

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('./_lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { token, pin } = req.body || {};

  if (!token) {
    return res.status(401).json({ error: 'Missing token.' });
  }
  const claims = verifyToken(token);
  if (!claims) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  const username = claims.username;

  // Require PIN re-entry as a safety check.
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN is required to confirm deletion.' });
  }

  const { data: player, error: lookupErr } = await supabase
    .from('players')
    .select('pin_hash')
    .eq('username', username)
    .maybeSingle();

  if (lookupErr) {
    console.error('[/api/delete] lookup error:', lookupErr);
    return res.status(500).json({ error: 'Delete failed.' });
  }
  if (!player) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const ok = await bcrypt.compare(pin, player.pin_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect PIN.' });
  }

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('username', username);

  if (error) {
    console.error('[/api/delete] delete error:', error);
    return res.status(500).json({ error: 'Delete failed. Try again.' });
  }

  return res.json({ success: true });
};
