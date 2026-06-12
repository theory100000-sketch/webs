ATLAS CREATIVE - AUTOGUARDADO SIN FIREBASE

Esta versión NO usa Firebase/Firestore.

Cómo funciona:
- La web guarda todo en /api/state.
- /api/state usa Vercel KV como base de datos central.
- Cada navegador consulta cambios cada 1,5 segundos.
- Si Atlas borra, crea o cambia algo, cualquier otra persona lo ve al recargar o casi al instante.

PASOS EN VERCEL:
1. Sube este ZIP a Vercel o reemplaza los archivos del proyecto.
2. En Vercel entra al proyecto > Storage.
3. Crea o conecta una base de datos KV.
4. Vercel añadirá automáticamente las variables KV_REST_API_URL y KV_REST_API_TOKEN.
5. Redeploy.

Sin una base de datos central no se puede sincronizar entre navegadores distintos.
LocalStorage solo guarda en el navegador de esa persona.
