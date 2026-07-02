// POST /api/sync
// Body: { token, current_level?, gadgets_light?, gadgets_freeze? }
// Header alternative: Authorization: Bearer <token>
// Returns: { success, player } on success
//          { error } on failure (401 / 400 / 500)
//
// Called by the game whenever state changes:
//   - On level win:        sync({ current_level: newLevel })
//   - On gadget use:       sync({ gadgets_light: gadgets_light - 1 })
//   - On rewarded ad:      sync({ gadgets_light: gadgets_light + 1 })
//   - On startup (login):  just to load current state from server

const { createClient } = require('@supabase/supabase-js');
const { usernameFromAuthHeader } = require('./_lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Hard caps to reject obviously-cheated values from a modified client.
const LIMITS = {
  current_level:  { min: 1,   max: 1000 },
  gadgets_light:  { min: 0,   max: 99   },
  gadgets_freeze: { min: 0,   max: 99   },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Accept token from body OR Authorization header (header is preferred).
  const auth = req.headers.authorization;
  const token = (auth && auth.startsWith('Bearer ') ? auth.slice(7) : null)
             || (req.body && req.body.token);
  const username = usernameFromAuthHeader(auth) || (token ? null : null);

  if (!token) {
    return res.status(401).json({ error: 'Missing token.' });
  }
  if (!username) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const updates = {};
  for (const field of ['current_level', 'gadgets_light', 'gadgets_freeze']) {
    if (typeof req.body[field] === 'number') {
      const v = req.body[field];
      const lim = LIMITS[field];
      if (!Number.isInteger(v) || v < lim.min || v > lim.max) {
        return res.status(400).json({ error: `Invalid value for ${field}.` });
      }
      updates[field] = v;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  const { data: player, error } = await supabase
    .from('players')
    .update(updates)
    .eq('username', username)
    .select('username, current_level, gadgets_light, gadgets_freeze')
    .single();

  if (error) {
    console.error('[/api/sync] update error:', error);
    return res.status(500).json({ error: 'Sync failed. Try again.' });
  }

  return res.json({ success: true, player });
};
