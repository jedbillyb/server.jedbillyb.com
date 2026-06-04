export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (header.slice(7) !== process.env.API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
