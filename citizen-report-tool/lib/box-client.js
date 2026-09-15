const BOX_API = 'https://api.box.com';
const BOX_OAUTH_TOKEN_URL = `${BOX_API}/oauth2/token`;
const BOX_UPLOAD_URL = `${BOX_API}/2.0/files/content`;
const BOX_FOLDER_URL = `${BOX_API}/2.0/folders`;
const BOX_SEARCH_URL = `${BOX_API}/2.0/search`;
const BOX_USER_URL = `${BOX_API}/2.0/users/me`;

export async function getAccessToken() {
  const clientId = process.env.BOX_CLIENT_ID;
  const clientSecret = process.env.BOX_CLIENT_SECRET;
  const enterpriseId = process.env.BOX_ENTERPRISE_ID;

  if (!clientId || !clientSecret || !enterpriseId) {
    throw new Error('Missing Box credentials in environment (BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID)');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    box_subject_type: 'enterprise',
    box_subject_id: enterpriseId,
  });

  const resp = await fetch(BOX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Box auth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  return data.access_token;
}

export async function getCurrentUser(token) {
  const resp = await fetch(BOX_USER_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Box get user failed (${resp.status}): ${text}`);
  }

  return await resp.json();
}

export async function ensureDateFolder(token, rootFolderId, date) {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const folderName = dateStr;

  try {
    const existing = await searchFolderByName(token, rootFolderId, folderName);
    if (existing) {
      return existing.id;
    }
  } catch (err) {
    console.error('Search failed, will try to create:', err.message);
  }

  const newFolder = await createFolder(token, rootFolderId, folderName);
  return newFolder.id;
}

async function searchFolderByName(token, parentFolderId, name) {
  const query = `name = '${name.replace(/'/g, "\\'")}' AND parent_id = ${parentFolderId} AND type = 'folder'`;
  const params = new URLSearchParams({ query });

  const resp = await fetch(`${BOX_SEARCH_URL}?${params}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    throw new Error(`Box search failed (${resp.status})`);
  }

  const data = await resp.json();
  return data.entries && data.entries.length > 0 ? data.entries[0] : null;
}

async function createFolder(token, parentFolderId, name) {
  const payload = {
    name,
    parent: { id: parentFolderId },
  };

  const resp = await fetch(BOX_FOLDER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Box create folder failed (${resp.status}): ${text}`);
  }

  return await resp.json();
}

export async function uploadReport(token, folderId, report) {
  const filename = `${report.id}.json`;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  return uploadFile(token, folderId, filename, blob);
}

export async function uploadFile(token, folderId, filename, blob) {
  const form = new FormData();
  form.append('attributes', JSON.stringify({ name: filename, parent: { id: folderId } }));
  form.append('file', blob, filename);

  const resp = await fetch(BOX_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Box upload failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  return data.entries && data.entries.length > 0 ? data.entries[0] : null;
}
