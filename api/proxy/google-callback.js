export default async function handler(req, res) {
    const BACKEND_GOOGLE_CALLBACK_URL =
      'https://tourguidehurghda.runasp.net/api/ExternalAuth/GoogleCallback';
  
    // Forward the request to your backend
    const backendResponse = await fetch(BACKEND_GOOGLE_CALLBACK_URL, {
      method: req.method,
      headers: {
        ...req.headers,
      },
      redirect: 'manual',
    });
  
    // ✅ Pass through Set-Cookie headers from backend to browser
    const setCookie = backendResponse.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }
  
    // ✅ Forward redirect response to frontend (if backend returns a 302)
    const location = backendResponse.headers.get('location');
    if (location) {
      res.writeHead(302, { Location: location });
      return res.end();
    }
  
    // ✅ Fallback: return body as-is (should rarely be hit)
    const responseText = await backendResponse.text();
    res.status(backendResponse.status).send(responseText);
  }
  