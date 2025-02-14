// Sportify OAuth
var AUTH = (function() {
  const CLIENT_ID = '66ed85f628e24aef9b803c8b8cca4de9';
  var REDIRECT_URI;
  var accessToken = '';

  // Generate random string for state
  function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // Generate code verifier for PKCE
  function generateCodeVerifier() {
    return generateRandomString(128);
  }

  // Generate code challenge from verifier
  async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  var login = async function(successCallback) {
    if (location.host === 'localhost') {
      REDIRECT_URI = 'http://127.0.0.1/spotifysearch/callback.html';
    } else {
      REDIRECT_URI = 'https://spotifysearch.reimsbach.dev/callback.html';
    }

    // Generate and store PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    localStorage.setItem('code_verifier', codeVerifier);

    function getLoginURL() {
      return 'https://accounts.spotify.com/authorize?' +
        'client_id=' + CLIENT_ID +
        '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
        '&response_type=code' +
        '&code_challenge_method=S256' +
        '&code_challenge=' + codeChallenge +
        '&scope=user-read-private user-read-email playlist-read-private playlist-read-collaborative';
    }

    window.addEventListener("message", async function(event) {
      try {
        var data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        if (data.type === 'authorization_code') {
          console.log('Exchanging code for token...');
          await exchangeCode(data.code);
          if (successCallback) {
            successCallback();
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }, false);

    var width = 450,
      height = 730,
      left = (screen.width / 2) - (width / 2),
      top = (screen.height / 2) - (height / 2);

    w = window.open(getLoginURL(),
      'Spotify',
      'menubar=no,location=no,resizable=no,scrollbars=no,status=no, width=' +
      width + ', height=' + height + ', top=' + top + ', left=' + left
    );
  };

  async function exchangeCode(code) {
    try {
      console.log('Starting code exchange...');
      const codeVerifier = localStorage.getItem('code_verifier');
      
      if (!codeVerifier) {
        throw new Error('No code verifier found in localStorage');
      }

      console.log('Making token request...');
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error('Token exchange failed: ' + JSON.stringify(errorData));
      }

      const data = await response.json();
      console.log('Token exchange successful');
      setAccessToken(data.access_token, data.expires_in);
      localStorage.removeItem('code_verifier'); // Clean up
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      throw error;
    }
  }

  var getAccessToken = function() {
    var expires = 0 + localStorage.getItem('pa_expires', '0');
    if ((new Date()).getTime() > expires) {
      return '';
    }
    var token = localStorage.getItem('pa_token', '');
    return token;
  };

  var setAccessToken = function(token, expires_in) {
    var expiresDate = new Date();
    expiresDate.setTime(expiresDate.getTime() + 1000 * expires_in);

    localStorage.setItem('pa_token', token);
    localStorage.setItem('pa_expires', expiresDate.getTime());
  };

  var isLoggedin = function() {
    return getAccessToken() !== '';
  }

  return {
    login: login,
    isLoggedin: isLoggedin,
    getAccessToken: getAccessToken
  }

})();
