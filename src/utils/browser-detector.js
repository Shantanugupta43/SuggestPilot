/**
 * Browser & OS Detection
 * Shared utility used by both content-script and form-detector.
 */

export function detectOS() {
  const ua = navigator.userAgent;
  if (/Windows NT 11/.test(ua)) return 'Windows 11';
  if (/Windows NT 10/.test(ua)) return 'Windows 10';
  if (/Mac OS X/.test(ua)) {
    const v = ua.match(/Mac OS X ([\d_]+)/);
    return v ? `macOS ${v[1].replace(/_/g, '.')}` : 'macOS';
  }
  if (/Linux/.test(ua)) return 'Linux';
  if (/Android/.test(ua)) {
    const v = ua.match(/Android ([\d.]+)/);
    return v ? `Android ${v[1]}` : 'Android';
  }
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  return null;
}

export function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) {
    const v = ua.match(/Edg\/([\d.]+)/);
    return `Microsoft Edge ${v ? v[1].split('.')[0] : ''}`.trim();
  }
  if (/OPR\//.test(ua)) {
    const v = ua.match(/OPR\/([\d.]+)/);
    return `Opera ${v ? v[1].split('.')[0] : ''}`.trim();
  }
  if (/Chrome\//.test(ua)) {
    const v = ua.match(/Chrome\/([\d.]+)/);
    return `Chrome ${v ? v[1].split('.')[0] : ''}`.trim();
  }
  if (/Firefox\//.test(ua)) {
    const v = ua.match(/Firefox\/([\d.]+)/);
    return `Firefox ${v ? v[1].split('.')[0] : ''}`.trim();
  }
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}
