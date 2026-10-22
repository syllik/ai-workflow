export function githubAppGitAuthorization(token) {
  if (typeof token !== 'string' || token.length === 0) throw new TypeError('GitHub App installation token is required');
  const credentials = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return `Authorization: Basic ${credentials}`;
}
