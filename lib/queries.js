import supabase from './db.js';

// ── ORDERS ────────────────────────────────────────────────

export async function createOrder(data) {
  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { data: row, error } = await supabase.from('orders').insert({
    order_id:             orderId,
    student_name:         data.student.name,
    student_email:        data.student.email.toLowerCase(),
    student_phone:        data.student.phone || null,
    matric_number:        data.student.matricNumber || null,
    files:                data.files,
    pricing:              data.pricing,
    pickup_location:      data.pickupLocation || 'Main Library',
    special_instructions: data.specialInstructions || null,
    referral_code:        data.referralCode || null,
    channel:              data.channel || 'web',
  }).select().single();
  if (error) throw error;
  return normalizeOrder(row);
}

export async function findOrder(orderId) {
  const { data } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
  return normalizeOrder(data);
}

export async function findOrderByPaystackRef(reference) {
  const { data } = await supabase.from('orders').select('*').eq('paystack_reference', reference).single();
  return normalizeOrder(data);
}

export async function listOrders({ status, paymentStatus, email, search, page = 1, limit = 50 } = {}) {
  let q = supabase.from('orders').select('*', { count: 'exact' });
  if (status)        q = q.eq('status', status);
  if (paymentStatus) q = q.eq('payment_status', paymentStatus);
  if (email)         q = q.eq('student_email', email.toLowerCase());
  if (search) {
    q = q.or(
      `order_id.ilike.%${search}%,student_name.ilike.%${search}%,student_email.ilike.%${search}%,matric_number.ilike.%${search}%`
    );
  }
  const from = (Number(page) - 1) * Number(limit);
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + Number(limit) - 1);
  if (error) throw error;
  return { orders: (data || []).map(normalizeOrder), total: count || 0 };
}

export async function updateOrderStatus(orderId, updates) {
  const patch = { updated_at: new Date().toISOString() };
  if (updates.status)          patch.status = updates.status;
  if (updates.adminNotes)      patch.admin_notes = updates.adminNotes;
  if (updates.estimatedReadyAt) patch.estimated_ready_at = new Date(updates.estimatedReadyAt).toISOString();
  const { data, error } = await supabase.from('orders').update(patch).eq('order_id', orderId).select().single();
  if (error) throw error;
  return normalizeOrder(data);
}

export async function markOrderPaid(orderId, reference) {
  const { data, error } = await supabase.from('orders').update({
    payment_status:      'paid',
    paid_at:             new Date().toISOString(),
    status:              'confirmed',
    paystack_reference:  reference,
    updated_at:          new Date().toISOString(),
  }).eq('order_id', orderId).select().single();
  if (error) throw error;
  return normalizeOrder(data);
}

export async function setOrderPaystackRef(orderId, reference) {
  await supabase.from('orders').update({ paystack_reference: reference, updated_at: new Date().toISOString() }).eq('order_id', orderId);
}

export async function getOrderStats() {
  const { data } = await supabase.from('orders').select('status, payment_status, pricing');
  if (!data) return { orders: { total: 0, pending: 0, confirmed: 0, printing: 0, ready: 0, collected: 0 }, revenue: 0 };
  const counts = { total: 0, pending: 0, confirmed: 0, printing: 0, ready: 0, collected: 0 };
  let revenue = 0;
  for (const o of data) {
    counts.total++;
    if (counts[o.status] !== undefined) counts[o.status]++;
    if (o.payment_status === 'paid') revenue += (o.pricing?.totalAmount || 0);
  }
  return { orders: counts, revenue };
}

function normalizeOrder(row) {
  if (!row) return null;
  return {
    _id:     row.id,
    orderId: row.order_id,
    student: { name: row.student_name, email: row.student_email, phone: row.student_phone, matricNumber: row.matric_number },
    files:   row.files,
    pricing: row.pricing,
    pickupLocation:      row.pickup_location,
    specialInstructions: row.special_instructions,
    referralCode:   row.referral_code,
    channel:        row.channel,
    status:         row.status,
    payment: {
      status:             row.payment_status,
      method:             row.payment_method || 'paystack',
      paystackReference:  row.paystack_reference,
      paidAt:             row.paid_at,
    },
    adminNotes:      row.admin_notes,
    estimatedReadyAt: row.estimated_ready_at,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

// ── ADMINS ────────────────────────────────────────────────

export async function findAdmin(username) {
  const { data } = await supabase.from('admins').select('*').eq('username', username.toLowerCase().trim()).single();
  return data;
}

export async function upsertAdmin(username, hashedPassword, role = 'admin') {
  const existing = await findAdmin(username);
  if (existing) {
    const { data } = await supabase.from('admins').update({ password: hashedPassword, updated_at: new Date().toISOString() }).eq('username', username.toLowerCase()).select().single();
    return data;
  }
  const { data, error } = await supabase.from('admins').insert({ username: username.toLowerCase().trim(), password: hashedPassword, role }).select().single();
  if (error) throw error;
  return data;
}

export async function updateAdminLogin(id) {
  await supabase.from('admins').update({ last_login: new Date().toISOString() }).eq('id', id);
}

// ── UPLOAD RECORDS ────────────────────────────────────────

export async function createUploadRecord(data) {
  const { data: row, error } = await supabase.from('upload_records').insert({
    original_name:        data.originalName,
    cloudinary_public_id: data.cloudinaryPublicId,
    secure_url:           data.secureUrl,
    resource_type:        data.resourceType,
    format:               data.format || null,
    mime_type:            data.mimeType || null,
    size:                 data.size || null,
    page_count:           data.pageCount || null,
    width:                data.width || null,
    height:               data.height || null,
    student_email:        data.studentEmail?.toLowerCase() || null,
  }).select().single();
  if (error) throw error;
  return row;
}

export async function findUploadRecord(id) {
  const { data } = await supabase.from('upload_records').select('*').eq('id', id).single();
  return data;
}

export async function markUploadDeleted(id) {
  await supabase.from('upload_records').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', id);
}

export async function getUploadHistory(email, limit = 12) {
  const { data } = await supabase
    .from('upload_records')
    .select('id, original_name, size, page_count, created_at, secure_url, resource_type, format, mime_type, width, height')
    .eq('student_email', email.toLowerCase().trim())
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function listUploadRecords({ email, page = 1, limit = 50 } = {}) {
  let q = supabase.from('upload_records').select('*', { count: 'exact' }).eq('status', 'active');
  if (email) q = q.ilike('student_email', `%${email.trim()}%`);
  const from = (Number(page) - 1) * Number(limit);
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + Number(limit) - 1);
  if (error) throw error;
  return { records: (data || []).map(r => ({
    _id:           r.id,
    originalName:  r.original_name,
    publicId:      r.cloudinary_public_id,
    secureUrl:     r.secure_url,
    resourceType:  r.resource_type,
    format:        r.format,
    mimeType:      r.mime_type,
    size:          r.size,
    pageCount:     r.page_count,
    studentEmail:  r.student_email,
    status:        r.status,
    createdAt:     r.created_at,
  })), total: count || 0 };
}

// ── REFERRALS ─────────────────────────────────────────────

export async function findReferral(code) {
  const { data } = await supabase.from('referrals').select('*').eq('code', code.toUpperCase().trim()).single();
  return data;
}

export async function findReferralByEmail(email) {
  const { data } = await supabase.from('referrals').select('*').eq('email', email.toLowerCase().trim()).single();
  return data;
}

export async function createReferral(data) {
  const { data: row, error } = await supabase.from('referrals').insert({
    code:    data.code.toUpperCase().trim(),
    name:    data.name.trim(),
    email:   data.email.toLowerCase().trim(),
    phone:   data.phone || null,
    faculty: data.faculty || null,
    level:   data.level || null,
  }).select().single();
  if (error) throw error;
  return row;
}

export async function referralExists(code) {
  const { data } = await supabase.from('referrals').select('id').eq('code', code).single();
  return Boolean(data);
}

export async function creditReferral(code, pages, commission) {
  const ref = await findReferral(code);
  if (!ref) return;
  await supabase.from('referrals').update({
    total_pages_referred: (ref.total_pages_referred || 0) + pages,
    total_earnings:       (ref.total_earnings || 0) + commission,
    updated_at:           new Date().toISOString(),
  }).eq('code', code.toUpperCase());
}

export async function listReferrals() {
  const { data } = await supabase.from('referrals').select('*').order('total_earnings', { ascending: false });
  return (data || []).map(r => ({
    code:          r.code,
    name:          r.name,
    email:         r.email,
    phone:         r.phone,
    active:        r.active,
    pagesReferred: r.total_pages_referred,
    earnings:      r.total_earnings,
    paid:          r.paid_out,
    pending:       (r.total_earnings || 0) - (r.paid_out || 0),
    createdAt:     r.created_at,
  }));
}

export async function payoutReferral(code, amount) {
  const ref = await findReferral(code);
  if (!ref) throw new Error('Referral not found');
  const payout = amount ?? ((ref.total_earnings || 0) - (ref.paid_out || 0));
  const { data, error } = await supabase.from('referrals').update({
    paid_out:    (ref.paid_out || 0) + payout,
    updated_at:  new Date().toISOString(),
  }).eq('code', code.toUpperCase()).select().single();
  if (error) throw error;
  return data;
}

export function normalizeReferralPublic(row) {
  if (!row) return null;
  return {
    code:                row.code,
    name:                row.name,
    email:               row.email,
    phone:               row.phone,
    faculty:             row.faculty,
    level:               row.level,
    active:              row.active,
    totalPagesReferred:  row.total_pages_referred,
    totalEarnings:       row.total_earnings,
    paidOut:             row.paid_out,
  };
}
