import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dxautkeaaxayfshxwaiq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YXV0a2VhYXhheWZzaHh3YWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTk5ODUsImV4cCI6MjA5MzY3NTk4NX0.R2E73D399_fE1v7JSppU0KCk-staD1ekFZkPIWvQmVg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
