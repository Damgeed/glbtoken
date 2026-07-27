// ── Secure Storage: at-rest encryption for localStorage ──
// Encrypts sensitive values (tokens, user data) before writing to localStorage.
// Uses XOR cipher with a key derived from a random salt + app pepper.
// Protects against: casual DevTools inspection, simple localStorage exfiltration.
// Key limitation: an attacker with XSS/runtime access can still read values.

(function(){
  const STORAGE_PREFIX = '__e:';  // marks encrypted values
  const SALT_KEY = 'gt_sk';      // salt storage key
  const PEPPER = 'GlbTOKEN_SECURE_2024';  // app-specific secret

  // Generate or retrieve persistent salt
  function getSalt(){
    let s = localStorage.getItem(SALT_KEY);
    if(!s){
      var arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      s = '';
      for(var i=0;i<arr.length;i++) s += String.fromCharCode(arr[i]);
      s = btoa(s);
      localStorage.setItem(SALT_KEY, s);
    }
    return s;
  }

  // Derive encryption key from salt + pepper using DJB2 hash (synchronous, deterministic)
  function deriveKey(){
    var s = getSalt();
    var seed = PEPPER + ':' + s;
    var hash = 5381;
    for(var i=0;i<seed.length;i++){
      hash = ((hash << 5) + hash) + seed.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit int
    }
    // Expand to 64-byte key
    var key = '';
    var h = hash;
    for(var i=0;i<64;i++){
      h = ((h << 5) - h) + (i * 31 + 7);
      h = h & h;
      key += String.fromCharCode(h & 0xFF);
    }
    return key;
  }

  function encrypt(plaintext){
    var key = deriveKey();
    var result = '';
    for(var i=0;i<plaintext.length;i++){
      var c = plaintext.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(c);
    }
    return btoa(result);
  }

  function decrypt(ciphertext){
    var key = deriveKey();
    var raw = atob(ciphertext);
    var result = '';
    for(var i=0;i<raw.length;i++){
      var c = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(c);
    }
    return result;
  }

  // Public API
  window.__secure = {
    getItem: function(key){
      var raw = localStorage.getItem(key);
      if(!raw) return null;
      if(raw.indexOf(STORAGE_PREFIX) === 0){
        try { return decrypt(raw.substring(STORAGE_PREFIX.length)); }
        catch(e){ return null; }
      }
      return raw; // Unencrypted fallback
    },
    setItem: function(key, value){
      localStorage.setItem(key, STORAGE_PREFIX + encrypt(String(value)));
    },
    removeItem: function(key){
      localStorage.removeItem(key);
    },
    clear: function(){
      localStorage.removeItem(SALT_KEY);
    }
  };
})();
