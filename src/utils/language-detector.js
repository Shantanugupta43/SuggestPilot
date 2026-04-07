/**
 * Language Detection Utilities
 * Shared utility used by both content-script and form-detector.
 */

export function isSpokenLanguageField(combined) {
  const explicitPatterns = [
    'spoken language',
    'preferred language',
    'native language',
    'language preference',
    'mother tongue',
    'languages spoken',
    'preferred_language',
    'spoken_language',
    'native_language',
    'language_preference',
    'mother_tongue',
    'languages_spoken'
  ];

  if (explicitPatterns.some(pattern => combined.includes(pattern))) {
    return true;
  }

  if (!/(^|[\W_])(language|languages)([\W_]|$)/.test(combined)) {
    return false;
  }

  const technicalPatterns = [
    'coding language',
    'programming language',
    'query language',
    'language style',
    'primary language',
    'secondary language',
    'source language',
    'target language',
    'language code',
    'locale',
    'coding_language',
    'programming_language',
    'query_language',
    'language_style',
    'primary_language',
    'secondary_language',
    'source_language',
    'target_language',
    'language_code'
  ];

  return !technicalPatterns.some(pattern => combined.includes(pattern));
}

export function detectLanguages() {
  const locales = Array.from(new Set(
    [navigator.language, ...(navigator.languages || [])].filter(Boolean)
  ));

  const displayNames = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(locales, { type: 'language' })
    : null;

  return locales
    .map(locale => {
      const code = locale.split('-')[0];
      const displayName = displayNames?.of(code);
      if (!displayName || /^[a-z]{2}$/i.test(displayName)) return null;
      return displayName;
    })
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .slice(0, 3);
}
