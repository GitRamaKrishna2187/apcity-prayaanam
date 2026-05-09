import { createClient } from '@supabase/supabase-js'

// Replace these two values with your actual Supabase credentials
// Found at: supabase.com → your project → Settings → API
const SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL_HERE'
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
