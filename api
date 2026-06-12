const KEY = 'atlas_creative_shared_state_v3';

function defaultState(){
  const now = new Date().toLocaleString('es-ES');
  return {
    users:{ atlas:{name:'Atlas Creative', username:'atlas', password:'AtlasCreative2026!', role:'admin', email:'admin@atlascreative.es', company:'', projects:[], messages:[], invoices:[], files:[], tickets:[], activity:[]} },
    settings:{ webhook:'' },
    audit:[{id:String(Date.now()), action:'Sistema iniciado', detail:'Estado compartido creado en Upstash Redis', target:'global', user:'Sistema', date:now}],
    updatedAt:Date.now(),
    updatedBy:'sistema'
  };
}

function getEnv(){
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL_READ_ONLY;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function redis(command){
  const { url, token } = getEnv();
  if(!url || !token){
    throw new Error('Faltan variables KV_REST_API_URL y KV_REST_API_TOKEN. Conecta Upstash al proyecto y haz Redeploy.');
  }
  const res = await fetch(`${url}/pipeline`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify([command])
  });
  if(!res.ok) throw new Error(`Upstash error ${res.status}`);
  const data = await res.json();
  if(data[0]?.error) throw new Error(data[0].error);
  return data[0]?.result;
}

export default async function handler(req, res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  try{
    if(req.method === 'GET'){
      let raw = await redis(['GET', KEY]);
      let state = raw ? JSON.parse(raw) : null;
      if(!state){
        state = defaultState();
        await redis(['SET', KEY, JSON.stringify(state)]);
      }
      return res.status(200).json({ok:true, state});
    }
    if(req.method === 'POST'){
      const state = req.body;
      if(!state || typeof state !== 'object') return res.status(400).json({ok:false,error:'Estado inválido'});
      state.updatedAt = Date.now();
      await redis(['SET', KEY, JSON.stringify(state)]);
      return res.status(200).json({ok:true, state});
    }
    return res.status(405).json({ok:false,error:'Método no permitido'});
  }catch(err){
    return res.status(500).json({ok:false,error:err.message || 'Error de autoguardado'});
  }
}
