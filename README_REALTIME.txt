ATLAS CREATIVE - SINCRONIZACIÓN REAL ENTRE TODOS LOS NAVEGADORES

Esta versión NO usa localStorage para los datos importantes. Usa un único documento de Firestore:

colección: atlas_portal
documento: shared_state

Por eso cualquier cambio hecho desde la cuenta atlas en Chrome, Edge, Opera, Firefox o móvil aparece en los demás navegadores.

PASOS OBLIGATORIOS:
1. Firebase > Firestore > Reglas: publica temporalmente:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}

2. Sube este ZIP a Vercel.
3. Abre la misma URL en dos navegadores.
4. Entra con:
usuario: atlas
contraseña: AtlasCreative2026!

5. Cambia webhook, crea proyecto, factura o mensaje. Debe aparecer en ambos en tiempo real.

Si no funciona, abre F12 > Console y revisa el mensaje rojo de Firebase.
