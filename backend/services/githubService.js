const axios = require('axios');
const crypto = require('crypto');

/**
 * Fetch all repositories (public and private) for the authenticated GitHub user.
 */
exports.fetchUserRepositories = async (accessToken) => {
  try {
    const res = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      },
      params: {
        visibility: 'all',
        sort: 'updated',
        per_page: 100
      }
    });
    return res.data;
  } catch (err) {
    console.error('[GitHub Service] Error fetching repos:', err.message);
    throw err;
  }
};

/**
 * Create a webhook for a repository.
 */
exports.createWebhook = async (owner, repo, accessToken) => {
  try {
    const webhookUrl = `${process.env.PUBLIC_API_URL || 'http://localhost:5000'}/api/github/webhook`;
    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'stackpilot_webhook_secret_123';

    // Check if webhook already exists
    const existingHooks = await axios.get(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    const alreadyExists = existingHooks.data.some(
      hook => hook.config && hook.config.url === webhookUrl
    );

    if (alreadyExists) {
      console.log(`[GitHub Service] Webhook already exists for ${owner}/${repo}`);
      return;
    }

    // Create new webhook
    await axios.post(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      name: 'web',
      active: true,
      events: ['push'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: secret,
        insecure_ssl: '0'
      }
    }, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    console.log(`[GitHub Service] Webhook created for ${owner}/${repo}`);
  } catch (err) {
    console.error('[GitHub Service] Error creating webhook:', err.message);
    throw err;
  }
};

/**
 * Verify GitHub webhook signature.
 */
exports.verifyWebhookSignature = (req) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'stackpilot_webhook_secret_123';
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
};
