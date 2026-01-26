const translations = {
  en: require('../translations/messages-en.json'),
  gu: require('../translations/messages-gu.json'),
};

/**
 * Translates a message based on Accept-Language header or language code
 * @param {Object|String} reqOrLang - Express request object OR language code ('en' or 'gu')
 * @param {String} key - Translation key (e.g., 'product.created')
 * @param {String} defaultMessage - Fallback message if translation not found
 * @returns {String} Translated message
 */
const translateMessage = (reqOrLang, key, defaultMessage) => {
  try {
    let langCode = 'en';
    
    // Handle both req object and direct language code
    if (typeof reqOrLang === 'string') {
      // Direct language code provided
      langCode = (reqOrLang === 'gu' || reqOrLang === 'en') ? reqOrLang : 'en';
    } else if (reqOrLang && reqOrLang.headers) {
      // Request object provided
      const acceptLanguage = reqOrLang.headers['accept-language'] || reqOrLang.headers['Accept-Language'] || 'en';
      const language = acceptLanguage.split(',')[0].split('-')[0].trim().toLowerCase();
      langCode = (language === 'gu' || language === 'en') ? language : 'en';
    }
    
    const keys = key.split('.');
    let value = translations[langCode];
    
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) {
        // Fallback to English
        value = translations['en'];
        for (const k2 of keys) {
          value = value?.[k2];
        }
        return value || defaultMessage || key;
      }
    }
    
    return value || defaultMessage || key;
  } catch (error) {
    console.error('Translation error:', error);
    return defaultMessage || key;
  }
};

/**
 * Helper function to get language from request
 * @param {Object} req - Express request object
 * @returns {String} Language code ('en' or 'gu')
 */
const getLanguage = (req) => {
  try {
    if (!req || !req.headers) {
      return 'en';
    }
    const acceptLanguage = req.headers['accept-language'] || req.headers['Accept-Language'] || 'en';
    const language = acceptLanguage.split(',')[0].split('-')[0].trim().toLowerCase();
    return (language === 'gu' || language === 'en') ? language : 'en';
  } catch (error) {
    console.error('Get language error:', error);
    return 'en';
  }
};

module.exports = {
  translateMessage,
  getLanguage,
};

