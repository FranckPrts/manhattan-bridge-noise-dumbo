import '../lib/env.js';
import { getClient, createSignedUploadUrl, MEDIA_BUCKET } from '../lib/supabase-client.js';
import { requireUser, UnauthorizedError } from '../lib/require-user.js';

const EXT_BY_MIME = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const ALLOWED_KINDS = ['audio', 'image', 'video'];

function extensionFor(mimeType) {
  return EXT_BY_MIME[mimeType] || 'bin';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getClient();

  try {
    const user = await requireUser(req, supabase);

    const { content_type: contentType, kind } = req.body || {};

    if (typeof contentType !== 'string' || !contentType) {
      return res.status(400).json({ error: 'content_type is required' });
    }
    if (!ALLOWED_KINDS.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${ALLOWED_KINDS.join(', ')}` });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const id = crypto.randomUUID();
    const ext = extensionFor(contentType);
    const path = `${dateStr}/${user.id}/${kind}/${id}.${ext}`;

    const { signedUrl, token } = await createSignedUploadUrl(supabase, path);

    return res.status(200).json({ path, token, bucket: MEDIA_BUCKET, signedUrl });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error('Upload URL error:', err);
    return res.status(500).json({ error: 'Failed to create upload URL', message: err.message });
  }
}
