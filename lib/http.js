export function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function requireAdmin(request) {
  const expected = process.env.ADMIN_SECRET || '';
  const header = request.headers.get('authorization') || '';
  if (!expected || header !== `Bearer ${expected}`) {
    return false;
  }
  return true;
}
