// Compatibility endpoint retained so old clients fail safely after the VPS cutover.
// Approval notifications are sent by the VPS admin profile route.
export default function handler(_req, res) {
  res.status(410).json({
    error: 'This endpoint has moved to the KK & Friends community API.',
  });
}
