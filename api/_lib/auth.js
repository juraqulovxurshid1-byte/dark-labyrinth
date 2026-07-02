// JWT helpers shared by all /api routes. Not exposed as a route (the _ prefix
// tells Vercel to ignore this folder for routing).
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  // Fail loudly at startup rather than at first request — easier to debug.
  throw new Error('JWT_SECRET environment variable is not set.');
}

function signToken(username) {
  // 30-day session. Long enough that casual players don't get logged out
  // mid‑weekend, short enough that deleted accounts naturally expire.
  return jwt.sign({ username }, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

// Extracts a verified username from an Authorization header.
// Returns null if header is missing, malformed, or token is invalid/expired.
function usernameFromAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const claims = verifyToken(token);
  return claims ? claims.username : null;
}

module.exports = { signToken, verifyToken, usernameFromAuthHeader };
