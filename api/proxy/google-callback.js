export default async function handler(req, res) {
    const backendCallbackUrl = 'https://tourguidehurghda.runasp.net/api/ExternalAuth/GoogleCallback';
  
    const backendResponse = await fetch(backendCallbackUrl, {
      method: req.method,
      headers: {
        ...req.headers,
      },
      redirect: 'manual', // prevent auto-redirect
    });
  
    // Forward Set-Cookie
    const setCookie = backendResponse.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }
  
    // Forward redirect (if GoogleCallback returns 302)
    const location = backendResponse.headers.get('location');
    if (location) {
      res.writeHead(302, { Location: location });
      return res.end();
    }
  
    // Fallback for non-redirect responses
    const text = await backendResponse.text();
    res.status(backendResponse.status).send(text);
  }
  