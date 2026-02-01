// Crypto utilities for secure API key storage
// Uses AES-GCM encryption with Web Crypto API

const CRYPTO_KEY_NAME = 'encryptionKey';
const ALGORITHM = 'AES-GCM';

// Get or create the encryption key
async function getOrCreateKey() {
  const stored = await browser.storage.local.get(CRYPTO_KEY_NAME);

  if (stored[CRYPTO_KEY_NAME]) {
    // Import the stored key
    const keyData = new Uint8Array(stored[CRYPTO_KEY_NAME]);
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: ALGORITHM },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Generate a new key
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // Export and store it
  const exported = await crypto.subtle.exportKey('raw', key);
  await browser.storage.local.set({
    [CRYPTO_KEY_NAME]: Array.from(new Uint8Array(exported))
  });

  return key;
}

// Encrypt a string
async function encryptString(plaintext) {
  if (!plaintext) return null;

  const key = await getOrCreateKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate a random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // Combine IV and encrypted data
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  };
}

// Decrypt a string
async function decryptString(encrypted) {
  if (!encrypted || !encrypted.iv || !encrypted.data) return '';

  try {
    const key = await getOrCreateKey();
    const iv = new Uint8Array(encrypted.iv);
    const data = new Uint8Array(encrypted.data);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    // Decryption failed (possibly corrupted or wrong key)
    return '';
  }
}

// Save encrypted API settings
async function saveApiSettingsEncrypted(settings) {
  const encrypted = {
    groqKey: settings.groqKey ? await encryptString(settings.groqKey) : null,
    groqModel: settings.groqModel || 'llama-3.3-70b-versatile',
    geminiKey: settings.geminiKey ? await encryptString(settings.geminiKey) : null,
    geminiModel: settings.geminiModel || 'gemini-2.5-flash-lite',
    anthropicKey: settings.anthropicKey ? await encryptString(settings.anthropicKey) : null,
    anthropicModel: settings.anthropicModel || 'claude-haiku-4-5-20251001',
    openaiKey: settings.openaiKey ? await encryptString(settings.openaiKey) : null,
    openaiModel: settings.openaiModel || 'gpt-4.1-nano',
    provider: settings.provider || 'groq'
  };

  await browser.storage.local.set({ apiSettingsEncrypted: encrypted });
}

// Load and decrypt API settings
async function loadApiSettingsEncrypted() {
  const result = await browser.storage.local.get('apiSettingsEncrypted');
  const encrypted = result.apiSettingsEncrypted;

  if (!encrypted) {
    // Check for legacy unencrypted settings and migrate
    const legacy = await browser.storage.local.get('apiSettings');
    if (legacy.apiSettings) {
      // Migrate to encrypted storage
      await saveApiSettingsEncrypted(legacy.apiSettings);
      // Remove old unencrypted settings
      await browser.storage.local.remove('apiSettings');
      return {
        ...legacy.apiSettings,
        groqKey: legacy.apiSettings.groqKey || '',
        groqModel: legacy.apiSettings.groqModel || 'llama-3.3-70b-versatile',
        geminiKey: legacy.apiSettings.geminiKey || '',
        geminiModel: legacy.apiSettings.geminiModel || 'gemini-2.5-flash-lite',
        anthropicModel: legacy.apiSettings.anthropicModel || 'claude-haiku-4-5-20251001',
        openaiModel: legacy.apiSettings.openaiModel || 'gpt-4.1-nano'
      };
    }
    return {
      groqKey: '',
      groqModel: 'llama-3.3-70b-versatile',
      geminiKey: '',
      geminiModel: 'gemini-2.5-flash-lite',
      anthropicKey: '',
      anthropicModel: 'claude-haiku-4-5-20251001',
      openaiKey: '',
      openaiModel: 'gpt-4.1-nano',
      provider: 'groq'
    };
  }

  return {
    groqKey: await decryptString(encrypted.groqKey),
    groqModel: encrypted.groqModel || 'llama-3.3-70b-versatile',
    geminiKey: await decryptString(encrypted.geminiKey),
    geminiModel: encrypted.geminiModel || 'gemini-2.5-flash-lite',
    anthropicKey: await decryptString(encrypted.anthropicKey),
    anthropicModel: encrypted.anthropicModel || 'claude-haiku-4-5-20251001',
    openaiKey: await decryptString(encrypted.openaiKey),
    openaiModel: encrypted.openaiModel || 'gpt-4.1-nano',
    provider: encrypted.provider || 'groq'
  };
}

// Export for use in other files
window.CryptoUtils = {
  encryptString,
  decryptString,
  saveApiSettingsEncrypted,
  loadApiSettingsEncrypted
};
