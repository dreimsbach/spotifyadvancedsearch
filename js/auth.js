// Sportify OAuth
var AUTH = (function() {

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
    var CLIENT_ID = '66ed85f628e24aef9b803c8b8cca4de9';

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
        '&code_challenge=' + codeChallenge;
    }

    window.addEventListener("message", async function(event) {
      var data = JSON.parse(event.data);
      if (data.type == 'authorization_code') {
        await exchangeCode(data.code);
        if (successCallback) {
          successCallback();
        }
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
    const codeVerifier = localStorage.getItem('code_verifier');
    
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

    const data = await response.json();
    setAccessToken(data.access_token, data.expires_in);
    localStorage.removeItem('code_verifier'); // Clean up
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
