// Serverless proxy: browser calls THIS endpoint, never M360 directly.
// The M360 Bearer token lives only here, read from environment variables
// that you set in the Vercel dashboard (never committed to the repo).
//
// Required environment variables (set in Vercel -> Project -> Settings -> Environment Variables):
//   M360_AUTH_CODE
//   M360_AUTH_TOKEN

export default async function handler(req, res) {
    if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
    }

    const { imei } = req.body || {};
    if (!imei || typeof imei !== 'string' || !/^\d{14,17}$/.test(imei)) {
          return res.status(400).json({ error: 'Valid imei is required' });
    }

    const authCode = process.env.M360_AUTH_CODE;
    const authToken = process.env.M360_AUTH_TOKEN;

    if (!authCode || !authToken) {
          return res.status(500).json({ error: 'M360 credentials are not configured on the server' });
    }

    try {
          const m360Res = await fetch('https://m360soft.com/api/customer/v2/getHistory', {
                  method: 'POST',
                  headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authCode}-${authToken}`,
                  },
                          body: JSON.stringify({
                                    imei: [imei],
                                              hasDiagnostics: true,
                                    includeOpen: true,
                                    limit: 1,
                                    order: 'id:desc',
                          }),
          });

          const payload = await m360Res.json();

          if (!m360Res.ok || !payload?.meta?.success) {
                  return res.status(502).json({
                            hasDiagnostics: false,
                            error: payload?.meta?.errors?.title || 'M360 request failed',
                  });
          }

          const record = payload?.data?.records?.[0];

          if (!record || !record.diagnosticsResults?.length) {
                  return res.status(200).json({ hasDiagnostics: false });
          }

          const latest = record.diagnosticsResults[record.diagnosticsResults.length - 1];

          return res.status(200).json({
                  hasDiagnostics: true,
                  sessionId: record.sessionId,
                  imei: record.imei,
                  finishedTime: latest.finishedTime,
                  tests: latest.tests.map(t => ({ testId: t.testId, result: t.result })),
                  reportLinks: (record.diagnosticsReports || []).map(r => ({
                            html: r.htmlLink,
                            pdf: r.pdfLink,
                  })),
          });
    } catch (err) {
          console.error('M360 proxy error:', err);
          return res.status(500).json({ hasDiagnostics: false, error: 'Internal proxy error' });
    }
}
