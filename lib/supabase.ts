import { createClient } from '@supabase/supabase-js'

// Replace these two values with your actual Supabase credentials
// Found at: supabase.com → your project → Settings → API
const SUPABASE_URL = 'https://cestbejutcylclapdqqy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlc3RiZWp1dGN5bGNsYXBkcXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMDc4ODUsImV4cCI6MjA5Mzg4Mzg4NX0.lLYYWmeLsxVerlS_cuyqNxiF8lgw8Tmnxt7IF9mhA4c'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
