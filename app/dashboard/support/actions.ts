'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

type FollowupStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled'

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalDate(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

async function requirePrivateAccess() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) throw new Error('Sesi login berakhir.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, can_view_private')
    .eq('id', userId)
    .maybeSingle()

  if (!(profile?.role === 'superadmin' || profile?.can_view_private)) {
    throw new Error('Akses Private Assessment diperlukan.')
  }

  return supabase
}

export async function createFollowupAction(formData: FormData) {
  const signalId = optionalText(formData, 'signal_id')
  if (!signalId) throw new Error('Signal tidak valid.')

  const supabase = await requirePrivateAccess()
  const { error } = await supabase.rpc('create_support_followup', {
    p_signal_id: signalId,
    p_category: optionalText(formData, 'category'),
    p_notes: optionalText(formData, 'notes'),
    p_action: optionalText(formData, 'action'),
    p_deadline: optionalDate(formData, 'deadline'),
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/support')
}

export async function updateFollowupAction(formData: FormData) {
  const followupId = optionalText(formData, 'followup_id')
  const status = optionalText(formData, 'status') as FollowupStatus | null
  const allowed: FollowupStatus[] = ['open', 'in_progress', 'resolved', 'cancelled']
  if (!followupId || !status || !allowed.includes(status)) throw new Error('Data follow-up tidak valid.')

  const supabase = await requirePrivateAccess()
  const { error } = await supabase.rpc('update_support_followup', {
    p_followup_id: followupId,
    p_status: status,
    p_notes: optionalText(formData, 'notes'),
    p_action: optionalText(formData, 'action'),
    p_deadline: optionalDate(formData, 'deadline'),
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/support')
}

export async function setSignalStatusAction(formData: FormData) {
  const signalId = optionalText(formData, 'signal_id')
  const status = optionalText(formData, 'signal_status')
  if (!signalId || !status || !['open', 'reviewed', 'closed'].includes(status)) {
    throw new Error('Status signal tidak valid.')
  }

  const supabase = await requirePrivateAccess()
  const { error } = await supabase.rpc('set_support_signal_status', {
    p_signal_id: signalId,
    p_status: status,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/support')
}
