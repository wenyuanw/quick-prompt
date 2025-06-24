// User Info Storage Key
export const USER_INFO_STORAGE_KEY = 'google_user_info';

// Environment variables for client IDs
const WEB_APP_CLIENT_ID_PREFIX = import.meta.env.WXT_WEB_APP_CLIENT_ID_PREFIX || '';
const CHROME_CLIENT_ID_PREFIX = import.meta.env.WXT_CHROME_APP_CLIENT_ID_PREFIX || '';

console.log('WEB_APP_CLIENT_ID_PREFIX', WEB_APP_CLIENT_ID_PREFIX);
console.log('CHROME_CLIENT_ID_PREFIX', CHROME_CLIENT_ID_PREFIX);

export interface UserInfo {
  email: string;
  name: string;
  id: string;
}

export interface AuthResult {
  token: string;
  userInfo?: UserInfo;
}

// Helper to determine if we are in a Chrome-like environment that supports getAuthToken
export const isLikelyChromeDesktop = (): boolean => {
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('chrome/') && !ua.includes('edg/') && !ua.includes('opr/') && !navigator.userAgentData?.mobile
}

export const getDesktopTypeForAuth = async (): Promise<string> => {
  if (typeof navigator.userAgentData !== 'undefined' && navigator.userAgentData) {
    try {
      const highEntropyValues = await navigator.userAgentData.getHighEntropyValues(['platformArch', 'bitness', 'model'])
      const platform = (navigator.userAgentData.platform || '').toLowerCase()
      const brands = navigator.userAgentData.brands?.map((b: { brand: string; version: string }) => b.brand.toLowerCase()).join(',')

      console.log('[UAData Check]', {
        platform: platform,
        mobile: navigator.userAgentData.mobile,
        brands: brands,
        highEntropyValues: highEntropyValues
      })

      // Arc Browser on Windows reports as "Windows", "x86", "64" and brands include "Chromium", "Google Chrome"
      // but might not have "Arc" explicitly. It behaves like Chrome for getAuthToken.
      if (platform === 'windows' && brands?.includes('chromium') && brands?.includes('google chrome')) {
        // Further check if it's Arc or similar that might hide its true identity but supports getAuthToken
        if (isLikelyChromeDesktop()) return 'CHROME_DESKTOP_LIKELY' // Treat as Chrome if it walks and talks like Chrome
      }
      // Standard Chrome check
      if (navigator.userAgentData.brands?.some(b => b.brand.toLowerCase() === 'google chrome') && !navigator.userAgentData.mobile) return 'CHROME_DESKTOP_NATIVE'

    } catch (e) {
      console.warn('Error fetching highEntropyValues from UserAgentData:', e)
    }
  }
  // Fallback or non-Chromium
  if (isLikelyChromeDesktop()) return 'CHROME_DESKTOP_UA_FALLBACK'
  return 'OTHER'
}

// Core function for Google Authentication via getAuthToken (Chrome specific)
export const getAuthTokenInternal = (interactive: boolean): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!browser.identity || typeof browser.identity.getAuthToken !== 'function') {
      console.warn('browser.identity.getAuthToken is not available.');
      resolve(null);
      return;
    }

    const clientIdPrefix = CHROME_CLIENT_ID_PREFIX;
    if (!clientIdPrefix) {
      console.warn('CHROME_CLIENT_ID_PREFIX is not defined. Proceeding without explicit client_id for getAuthToken. May rely on extension ID whitelisting.');
    }
    console.log(`[getAuthTokenInternal] Calling browser.identity.getAuthToken (interactive: ${interactive}), Client ID prefix configured: ${!!clientIdPrefix}`);

    browser.identity.getAuthToken({ interactive }, (result: any) => {
      console.log(`[getAuthTokenInternal Callback] Received result/error from getAuthToken. Interactive: ${interactive}`);
      try {
        if (browser.runtime.lastError) {
          console.warn(`getAuthToken(interactive: ${interactive}) FAILED:`, browser.runtime.lastError.message);
          resolve(null);
          return;
        }

        let tokenToResolve: string | null = null;

        if (typeof result === 'string' && result) {
          tokenToResolve = result;
        } else if (result && typeof result.token === 'string' && result.token) {
          tokenToResolve = result.token;
        }

        if (tokenToResolve) {
          console.log(`getAuthToken(interactive: ${interactive}) successful with token (first few chars): ${tokenToResolve.substring(0,10)}...`);
          resolve(tokenToResolve);
        } else {
          console.warn(`getAuthToken(interactive: ${interactive}) did not yield a valid token. Result was:`, result);
          resolve(null);
        }
      } catch (e: any) {
        console.error(`[getAuthTokenInternal Callback] Error processing getAuthToken result (interactive: ${interactive}):`, e);
        resolve(null); // Ensure promise resolves even if internal processing fails
      }
    });
  });
};

// Core function for Google Authentication via launchWebAuthFlow
export const launchWebAuthFlowInternal = async (interactive: boolean): Promise<string | null> => {
  try {
    const webClientIdPrefix = WEB_APP_CLIENT_ID_PREFIX;
    if (!webClientIdPrefix) {
      console.error('WEB_APP_CLIENT_ID_PREFIX is not defined. Cannot use launchWebAuthFlow.');
      return null;
    }
    const CLIENT_ID = `${webClientIdPrefix}.apps.googleusercontent.com`;
    const REDIRECT_URI = browser.identity.getRedirectURL();
    const SCOPES = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];

    let authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    if (interactive) {
      authUrl.searchParams.append('prompt', 'select_account');
    }

    console.log(`Attempting launchWebAuthFlow with URL: ${authUrl.toString()} (interactive: ${interactive})`);

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive
    });

    if (!responseUrl) {
      console.warn(`launchWebAuthFlow(interactive: ${interactive}) returned no response URL. LastError:`, browser.runtime.lastError?.message);
      return null;
    }
    console.log(`launchWebAuthFlow(interactive: ${interactive}) successful. Response URL received.`);

    let token = null;
    try {
      const url = new URL(responseUrl);
      if (url.hash && url.hash.includes('access_token=')) {
        const params = new URLSearchParams(url.hash.substring(1));
        token = params.get('access_token');
      } else if (url.searchParams.has('access_token')) {
        token = url.searchParams.get('access_token');
      } else {
        console.warn('No access_token found in responseUrl from launchWebAuthFlow.');
      }
    } catch (urlParseError) {
      console.error('Error parsing response URL:', urlParseError, 'Raw responseUrl:', responseUrl);
    }

    if (!token) {
      console.warn('No access_token found in responseUrl from launchWebAuthFlow.');
      return null;
    }
    console.log('Successfully obtained token via launchWebAuthFlow.');
    return token;
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.warn(`launchWebAuthFlow (called with interactive: ${interactive}) failed: ${errorMsg}. LastError: ${browser.runtime.lastError?.message}`);
    return null;
  }
};

// Fetch user info from Google
export const getUserInfo = async (token: string): Promise<UserInfo | null> => {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.error('Failed to fetch user info:', response.status, await response.text());
      throw new Error('Failed to fetch user info');
    }
    const data = await response.json();
    if (!data.email || !data.name || !data.sub) {
      console.error('User info from Google is missing essential fields (email, name, sub):', data);
      return null;
    }
    return { email: data.email, name: data.name, id: data.sub };
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
};

// Unified Google Authentication function
export const authenticateWithGoogle = async (interactive: boolean): Promise<AuthResult | null> => {
  console.log(`[AUTH_START V2] authenticateWithGoogle(interactive: ${interactive})`);
  let token: string | null = null;
  const desktopType = await getDesktopTypeForAuth();
  console.log(`[AUTH_DESKTOP_TYPE V2] Determined desktop type: ${desktopType}`);

  const chromeClientIdPrefixAvailable = CHROME_CLIENT_ID_PREFIX;
  const webClientIdPrefixAvailable = WEB_APP_CLIENT_ID_PREFIX;

  if (!chromeClientIdPrefixAvailable && !webClientIdPrefixAvailable) {
    console.error("[AUTH_ERROR V2] Neither CHROME_CLIENT_ID_PREFIX nor WEB_APP_CLIENT_ID_PREFIX are defined. Authentication is not possible.");
    return null;
  }

  if (chromeClientIdPrefixAvailable && (desktopType.startsWith('CHROME_DESKTOP') || desktopType === 'OTHER_LIKELY_CHROME_GETAUTHTOKEN_CAPABLE')) {
    console.log('[AUTH_ATTEMPT V2] Trying getAuthTokenInternal...');
    token = await getAuthTokenInternal(interactive);
    if (token) {
      console.log('[AUTH_SUCCESS V2] Token obtained via getAuthTokenInternal.');
      // For getAuthToken, we fetch userInfo here to ensure it's fresh.
      const userInfo = await getUserInfo(token);
      if (userInfo) {
        await browser.storage.local.set({ [USER_INFO_STORAGE_KEY]: userInfo }); // Store user info
        return { token, userInfo };
      } else {
        console.warn('[AUTH_WARN V2] getAuthTokenInternal succeeded but getUserInfo failed. Token might be invalid or network issue.');
        // Do not return a token if userInfo cannot be fetched, as it might be stale/problematic.
        // Caller should handle this as a failed auth attempt.
        await browser.storage.local.remove(USER_INFO_STORAGE_KEY); // Ensure inconsistent state is cleared
        return null;
      }
    }
    console.warn('[AUTH_FALLBACK V2] getAuthTokenInternal failed or returned no token.');
    if (!webClientIdPrefixAvailable) {
      console.error("[AUTH_ERROR V2] getAuthToken failed and WEB_APP_CLIENT_ID_PREFIX is not available for fallback. Cannot authenticate.");
      return null;
    }
    console.log('[AUTH_FALLBACK V2] Proceeding to launchWebAuthFlowInternal as fallback.');
  } else if (!webClientIdPrefixAvailable) {
    console.error("[AUTH_ERROR V2] Not a Chrome-like desktop or CHROME_CLIENT_ID_PREFIX not set, and WEB_APP_CLIENT_ID_PREFIX is not available. Cannot authenticate.");
    return null;
  }

  if (webClientIdPrefixAvailable) {
    console.log('[AUTH_ATTEMPT V2] Trying launchWebAuthFlowInternal...');
    token = await launchWebAuthFlowInternal(interactive);
    if (token) {
      console.log('[AUTH_SUCCESS V2] Token obtained via launchWebAuthFlowInternal.');
      // For launchWebAuthFlow, we fetch userInfo here as well.
      const userInfo = await getUserInfo(token);
      if (userInfo) {
        await browser.storage.local.set({ [USER_INFO_STORAGE_KEY]: userInfo }); // Store user info
        return { token, userInfo };
      } else {
        console.warn('[AUTH_WARN V2] launchWebAuthFlowInternal succeeded but getUserInfo failed. Token might be invalid or network issue.');
        // As above, do not return a token if userInfo cannot be fetched.
        await browser.storage.local.remove(USER_INFO_STORAGE_KEY); // Ensure inconsistent state is cleared
        return null;
      }
    }
    console.warn('[AUTH_FAILURE V2] launchWebAuthFlowInternal also failed or returned no token.');
  } else {
    console.log('[AUTH_SKIP V2] launchWebAuthFlowInternal skipped as WEB_APP_CLIENT_ID_PREFIX is not available.');
  }

  console.error('[AUTH_END V2] Authentication failed after all attempts.');
  await browser.storage.local.remove(USER_INFO_STORAGE_KEY); // Ensure storage is cleared on final failure
  return null;
};

// Logout from Google
export const logoutGoogle = async (): Promise<void> => {
  console.log('Attempting to log out from Google...');
  let activeToken: string | null = null;
  try {
    // Attempt to get a non-interactive token to see if we are logged in.
    // This helps in deciding if removeCachedAuthToken needs to be called.
    // We don't strictly need the token value itself, just its presence.
    const authDetails = await browser.storage.local.get(USER_INFO_STORAGE_KEY);
    if (authDetails && authDetails[USER_INFO_STORAGE_KEY]) {
      // If user info exists, we can assume a token was previously obtained.
      // To be absolutely sure for removeCachedAuthToken, we *could* try getAuthToken(false)
      // but it might be overkill if we are clearing user info anyway.
      // For simplicity, we'll rely on stored user info as an indicator of an active session.
      // To be more robust, one might need to fetch the token to pass to removeCachedAuthToken,
      // especially if multiple accounts or token types were possible.

      // Try to get current token to remove it explicitly. This is a best effort.
      // Note: getAuthToken(false) might fail if token is expired, but removeCachedAuthToken
      // might still work based on browser's internal session state.
      if (browser.identity && typeof browser.identity.getAuthToken === 'function') {
        try {
          const tokenResponse = await getAuthTokenInternal(false); // Try to get current token without UI
          if (tokenResponse) { // tokenResponse is string | null
            activeToken = tokenResponse;
          }
        } catch (e) {
          console.warn("Error trying to fetch token non-interactively before logout:", e);
        }
      }
    }

    if (activeToken && browser.identity && typeof browser.identity.removeCachedAuthToken === 'function') {
      console.log('Removing cached auth token for token:', activeToken.substring(0, 20) + "...");
      await browser.identity.removeCachedAuthToken({ token: activeToken });
    } else if (browser.identity && typeof browser.identity.clearAllCachedAuthTokens === 'function') {
      // Fallback if a specific token couldn't be fetched or removeCachedAuthToken is unavailable
      // clearAllCachedAuthTokens is a more aggressive approach. Use with caution.
      // console.log('No specific token to remove or removeCachedAuthToken not available. Attempting to clear all cached auth tokens.');
      // await browser.identity.clearAllCachedAuthTokens(); // This is often too broad. Let's avoid unless necessary.
      // For most cases, just clearing our stored user info is sufficient if token removal is problematic.
    }

    // Always remove user info from our storage
    await browser.storage.local.remove(USER_INFO_STORAGE_KEY);
    console.log('User info removed from local storage. Logout process complete.');

  } catch (error) {
    console.error('Error during Google logout:', error);
    // Still attempt to clear local storage as a fallback
    await browser.storage.local.remove(USER_INFO_STORAGE_KEY);
    console.warn('Ensured user info is removed from local storage despite logout error.');
  }
};
