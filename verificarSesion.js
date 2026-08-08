(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { 
    window.location.href = "login.html"; 
    return; 
  }

  // 1. Obtener perfil del usuario (plan, rol, fecha de prueba y creación)
  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('plan, rol, fecha_fin_prueba, created_at')
    .eq('id', session.user.id)
    .single();

  // Si es administrador, tiene acceso total sin restricciones
  if (perfil?.rol === 'admin') return;

  const planActual = perfil?.plan || 'basico';
  const esDePago = planActual === 'profesional' || planActual === 'empresarial';

  // 2. CONTROL DE PRUEBA DE 3 DÍAS (Para Plan Básico / Gratuito)
  if (!esDePago) {
    const ahora = new Date();
    let fechaFin = perfil?.fecha_fin_prueba ? new Date(perfil.fecha_fin_prueba) : null;

    // Si fecha_fin_prueba no está definida en la BD, calcula 3 días desde created_at
    if (!fechaFin && perfil?.created_at) {
      fechaFin = new Date(perfil.created_at);
      fechaFin.setDate(fechaFin.getDate() + 3);
    }

    // Si los 3 días de prueba ya expiraron, bloquea el acceso y redirige a precios
    if (fechaFin && ahora > fechaFin) {
      alert("⏱️ Tu período de prueba gratuita de 3 días ha finalizado.\n\nPor favor, selecciona un plan para activar tus alertas y continuar utilizando el Dashboard.");
      window.location.href = "precios.html";
      return;
    }
  }

  // 3. CONTROL DE LÍMITES DE DISPOSITIVOS ACTIVOS
  const LIMITES_DISPOSITIVOS = { basico: 1, profesional: 5, empresarial: 15 };
  const limite = LIMITES_DISPOSITIVOS[planActual] || 1;

  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('device_id', deviceId);
  }

  // Limpiar sesiones inactivas mayores a 15 minutos
  const quinceMinAntes = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabaseClient
    .from('sesiones_activas')
    .delete()
    .eq('usuario_id', session.user.id)
    .lt('ultima_actividad', quinceMinAntes);

  // Registrar / actualizar actividad del dispositivo actual
  await supabaseClient.from('sesiones_activas').upsert({
    usuario_id: session.user.id,
    device_id: deviceId,
    ultima_actividad: new Date().toISOString()
  }, { onConflict: 'usuario_id,device_id' });

  // Validar concurrencia de dispositivos
  const { data: sesiones } = await supabaseClient
    .from('sesiones_activas')
    .select('device_id')
    .eq('usuario_id', session.user.id);

  if (sesiones && sesiones.length > limite) {
    alert(`Tu plan (${planActual}) permite máximo ${limite} dispositivo(s) activo(s) a la vez. Cierra sesión en otro dispositivo o actualiza tu plan.`);
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  }
})();