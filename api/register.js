// POST /api/auth/register
// Body: { username: string, pin: string }
//   username: 3–20 chars, alphanumeric + underscore
//   pin:      exactly 4 digits
// Returns: { success, token, player } on success
//          { error } on failure (400 / 409 / 500)
//
// The PIN is hashed with bcrypt before storage. We never store or echo the
// raw PIN. On success, a 30‑day JWT is issued so the client can call /sync
// without re-entering the PIN on every request.

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { signToken } = require('../_lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { username, pin } = req.body || {};

  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–20 characters of letters, numbers, or underscores.',
    });
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  // Check if username is already taken. maybeSingle() returns null instead of
  // throwing when no row matches — that's exactly what we want here.
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const pin_hash = await bcrypt.hash(pin, 10);

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      username,
      pin_hash,
      current_level: 1,
      gadgets_light: 3,
      gadgets_freeze: 1,
    })
    .select('username, current_level, gadgets_light, gadgets_freeze')
    .single();

  if (error) {
    console.error('[/api/auth/register] insert error:', error);
    return res.status(500).json({ error: 'Could not create account. Try again.' });
  }

  const token = signToken(username);
  return res.status(201).json({ success: true, token, player });
};
