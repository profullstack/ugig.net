--- a/src/app/api/bounties/route.ts
+++ b/src/app/api/bounties/route.ts
@@ -10,7 +10,10 @@
 import { type NextRequest, NextResponse } from "next/server";
 import { createClient } from "@supabase/supabase-js";
 
+try {
   const requestBody = await request.json();
+} catch (error) {
+  return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
+}
 
 // existing code...
