// GET /api/leaderboard
// Optional header: Authorization: Bearer <token>
// Returns:
//   {
//     top: [{ username, current_level, updated_at }, ...],  // up to 100
//     you: { username, current_level, rank } | null          // null if not logged in
//   }
//
// "you" only appears if the caller sent a valid Bearer token. Otherwise
// it's null and the caller is just browsing anonymously.

const { createClient } = require('@supabase/supabase-js');
const { usernameFromAuthHeader } = require('./_lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { data: top, error } = await supabase
    .from('players')
    .select('username, current_level, updated_at')
    .order('current_level', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[/api/leaderboard] top query error:', error);
    return res.status(500).json({ error: 'Could not load leaderboard.' });
  }

  // If logged in, compute caller's rank and stats.
  let you = null;
  const username = usernameFromAuthHeader(req.headers.authorization);
  if (username) {
    const { data: me, error: meErr } = await supabase
      .from('players')
      .select('username, current_level')
      .eq('username', username)
      .maybeSingle();

    if (!meErr && me) {
      // Rank = number of players with strictly higher current_level + 1.
      // Simple monotonic rank; good enough for a small leaderboard.
      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .gt('current_level', me.current_level);

      you = {
        username: me.username,
        current_level: me.current_level,
        rank: (count || 0) + 1,
      };
    }
  }

  // Tiny cache hint: leaderboard changes only when someone wins a level, so
  // 10s cache is safe and reduces DB load if many players open the screen.
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  return res.json({ top: top || [], you });
};
