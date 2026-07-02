// POST /api/auth/login
// Body: { username: string, pin: string }
// Returns: { success, token, player } on success
//          { error } on failure (401 / 500)
//
// Same response for "username doesn't exist" and "wrong PIN" — never leak
// which one failed. Prevents username enumeration.

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

  if (!username || !pin) {
    return res.status(400).json({ error: 'Username and PIN are required.' });
  }

  const { data: player, error } = await supabase
    .from('players')
    .select('username, pin_hash, current_level, gadgets_light, gadgets_freeze')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    console.error('[/api/auth/login] query error:', error);
    return res.status(500).json({ error: 'Login failed. Try again.' });
  }

  // Always run bcrypt.compare even if player is null. This keeps response
  // timing constant — an attacker can't tell "username doesn't exist" from
  // "wrong PIN" by how fast the server replies.
  const pin_hash = player ? player.pin_hash : '$2b$10$invalidsaltinvalidsaltinvalidsalti';
  const ok = await bcrypt.compare(pin, pin_hash);

  if (!player || !ok) {
    return res.status(401).json({ error: 'Invalid username or PIN.' });
  }

  const token = signToken(username);
  return res.json({
    success: true,
    token,
    player: {
      username: player.username,
      current_level: player.current_level,
      gadgets_light: player.gadgets_light,
      gadgets_freeze: player.gadgets_freeze,
    },
  });
};
