export async function onRequest(context) {
  const url = new URL(context.request.url);
  const phone = (url.searchParams.get('p') || '').replace(/\D/g, '');
  if (!phone) {
    return new Response('Missing phone', { status: 400 });
  }
  // Server-side redirect to WA Business — Safari treats this as a fresh
  // navigation from a new URL, resetting its "repeatedly trying" counter.
  return Response.redirect('whatsappbusiness://send?phone=' + phone, 302);
}
