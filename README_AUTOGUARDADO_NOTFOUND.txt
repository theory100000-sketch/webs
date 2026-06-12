FIX Not Found:
Este ZIP incluye /api/state.js y vercel.json para que Vercel cree la ruta /api/state.

Pasos:
1. Conecta Upstash al proyecto desde Storage > Connect to Project.
2. Comprueba que existen estas variables en Settings > Environment Variables:
   KV_REST_API_URL
   KV_REST_API_TOKEN
   KV_REST_API_READ_ONLY_TOKEN (opcional)
3. Sube este ZIP/redeploy del proyecto.
4. Abre https://TU-DOMINIO.vercel.app/api/state
   Debe responder JSON con {"ok":true,...}. Si sale Not Found, Vercel no ha desplegado la carpeta api.
