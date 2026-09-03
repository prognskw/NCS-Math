import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bqmttqextqlnrecuvent.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxbXR0cWV4dHFsbnJlY3V2ZW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTA0OTcsImV4cCI6MjEwMzk4NjQ5N30.MfKxs_ZSbEq-cPXACZVCVOSE6j1dtwDkeDT_E9OlHkU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
