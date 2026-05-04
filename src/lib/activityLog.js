import { supabase } from './supabase'

export function logActivity(businessId, userId, type, description) {
  supabase.from('activity_log').insert({ business_id: businessId, user_id: userId, type, description })
    .then(() => {})
    .catch(() => {})
}
