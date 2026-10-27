import { readFile, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

// Only the toolbar's normalized, hash-bound icon cache is returned as preview images.
export async function editPreviewContent(response, request, appData = process.env.LOCALAPPDATA ?? '') {
  const content = [{ type: 'text', text: JSON.stringify(response) }];
  if (!response.success || request.buttonEdits?.operation !== 'preview') return content;
  const iconBase = resolve(join(appData, 'FluxBar', 'Icons'));
  for (const change of response.data?.changes ?? []) {
    if (!change.iconPreview) continue;
    const icon = change.iconPreview;
    const offset = relative(iconBase, resolve(icon.localPath));
    if (!offset || offset.startsWith('..') || isAbsolute(offset) || !/^[a-f0-9]{32}\.png$/i.test(offset) || (await stat(icon.localPath)).size > 2 * 1024 * 1024)
      throw Error('Invalid staged favicon preview.');
    const bytes = await readFile(icon.localPath);
    if (createHash('sha256').update(bytes).digest('hex').toUpperCase() !== icon.sha256) throw Error('Staged favicon changed. Request a fresh preview.');
    content.push({ type: 'text', text: `Favicon preview for ${change.buttonLabel} (${change.buttonId}); ask the user to confirm before applying.` });
    content.push({ type: 'image', mimeType: 'image/png', data: bytes.toString('base64') });
  }
  return content;
}
