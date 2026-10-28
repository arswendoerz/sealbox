// Offscreen documents can't use navigator.clipboard (never focused), but a copy event can set
// the clipboard to an empty string.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'clearClipboard') return false;
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', '');
    e.preventDefault();
  };
  document.addEventListener('copy', onCopy, { once: true });
  document.execCommand('copy');
  reply({ ok: true }); // so the background's await resolves and it can close this document
  return false;
});
