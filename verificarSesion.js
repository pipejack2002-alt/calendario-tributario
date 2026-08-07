(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }

  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('plan, rol')
    .eq('id', session.user.id)
    .single();

  if (perfil?.rol === 'admin') return;

  const LIMITES_DISPOSITIVOS = { basico: 1, profesional: 5, empresarial: 15 };
  const limite = LIMITES_DISPOSITIVOS[perfil?.plan] || 1;

  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('device_id', deviceId);
  }

  const quinceMinAntes = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabaseClient.from('sesiones_activas').delete().eq('usuario_id', session.user.id).lt('ultima_actividad', quinceMinAntes);

  await supabaseClient.from('sesiones_activas').upsert({
    usuario_id: session.user.id,
    device_id: deviceId,
    ultima_actividad: new Date().toISOString()
  }, { onConflict: 'usuario_id,device_id' });

  const { data: sesiones } = await supabaseClient.from('sesiones_activas').select('device_id').eq('usuario_id', session.user.id);

  if (sesiones && sesiones.length > limite) {
    alert(`Tu plan (${perfil.plan}) permite máximo ${limite} dispositivo(s) activo(s) a la vez. Cierra sesión en otro dispositivo o actualiza tu plan.`);
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  }
})();