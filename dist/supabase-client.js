(() => {
  const config = window.MF_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.url, config.anonKey) : null;
  let currentRevision = null;
  const authError = (error) => {
    const message = error?.message || 'Não foi possível conectar ao banco de dados.';
    return new Error(message.includes('Invalid login credentials')
      ? 'E-mail ou senha incorretos.'
      : message);
  };
  const safeState = (state) => ({
    clients: (state.clients || []).filter((x) => !x.demo),
    projects: (state.projects || []).filter((x) => !x.demo),
    events: (state.events || []).filter((x) => !x.demo && !['e1','e2','e3','e4'].includes(x.id)),
    transactions: (state.transactions || []).filter((x) => !x.demo),
    portfolio: (state.portfolio || []).filter((x) => !x.demo).map(({ id, title, description, image, imagePath }) => ({ id, title, description, image, imagePath })),
    settings: state.settings || {},
    quotes: state.quotes || []
  });

  window.MFCloud = {
    configured,
    async getUser() {
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      if (error?.name === 'AuthSessionMissingError' || error?.message === 'Auth session missing!') return null;
      if (error) throw authError(error);
      return data.user || null;
    },
    async isOwner() {
      if (!client) return false;
      const { data, error } = await client.rpc('mf_is_workshop_owner');
      if (error) throw authError(error);
      return data === true;
    },
    async signIn(email, password) {
      if (!client) throw new Error('A conexão com o Supabase ainda não foi configurada.');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw authError(error);
      return data.user;
    },
    async signOut() {
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error) throw authError(error);
    },
    async loadState() {
      if (!client) return null;
      const user = await this.getUser();
      if (!user) return null;
      const { data, error } = await client.from('mf_workshop_state').select('data,revision').eq('user_id', user.id).maybeSingle();
      if (error) throw authError(error);
      currentRevision = data?.revision ?? null;
      return data?.data || null;
    },
    async saveState(state) {
      if (!client) return;
      const user = await this.getUser();
      if (!user) throw new Error('Entre no painel para salvar as alterações na nuvem.');
      const snapshot = safeState(state);
      if (currentRevision === null) {
        const { data, error } = await client.from('mf_workshop_state').insert({ user_id: user.id, data: snapshot, revision: 1 }).select('revision').single();
        if (error) throw authError(error.code === '23505' ? new Error('Os dados foram criados em outro dispositivo. Atualize a página antes de editar.') : error);
        currentRevision = data.revision;
      } else {
        const { data, error } = await client.from('mf_workshop_state').update({ data: snapshot, revision: currentRevision + 1, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('revision', currentRevision).select('revision').maybeSingle();
        if (error) throw authError(error);
        if (!data) throw new Error('Outro dispositivo salvou alterações primeiro. Atualize a página para carregar os dados mais recentes.');
        currentRevision = data.revision;
      }
      await this.savePortfolio(state.portfolio || [], user);
    },
    async savePortfolio(items, knownUser) {
      if (!client) return;
      const user = knownUser || await this.getUser();
      if (!user) return;
      const rows = (items || []).filter((item) => !item.demo).map((item) => ({
        id: item.id,
        user_id: user.id,
        title: item.title,
        description: item.description || '',
        image_url: item.image || null,
        image_path: item.imagePath || null,
        is_public: true,
        updated_at: new Date().toISOString()
      }));
      if (rows.length) {
        const { error } = await client.from('mf_portfolio_items').upsert(rows);
        if (error) throw authError(error);
      }
      const { data: existing, error: readError } = await client.from('mf_portfolio_items').select('id').eq('user_id', user.id);
      if (readError) throw authError(readError);
      const ids = rows.map((row) => row.id);
      const staleIds = (existing || []).map((row) => row.id).filter((id) => !ids.includes(id));
      if (staleIds.length) {
        const { error } = await client.from('mf_portfolio_items').delete().eq('user_id', user.id).in('id', staleIds);
        if (error) throw authError(error);
      }
    },
    async uploadPortfolioImage(file, itemId) {
      if (!client) throw new Error('Configure o Supabase para guardar fotos online.');
      const user = await this.getUser();
      if (!user) throw new Error('Entre no painel para enviar fotos.');
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/${itemId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await client.storage.from('mf-portfolio-images').upload(path, file, { contentType: file.type });
      if (error) throw authError(error);
      const { data } = client.storage.from('mf-portfolio-images').getPublicUrl(path);
      return { image: data.publicUrl, imagePath: path };
    },
    async loadPublicPortfolio() {
      if (!client) return [];
      const { data, error } = await client.from('mf_portfolio_items').select('id,title,description,image_url').eq('is_public', true).order('updated_at', { ascending: false });
      if (error) throw authError(error);
      return (data || []).map((item) => ({ id: item.id, title: item.title, description: item.description, image: item.image_url }));
    },
    async submitQuote(quote) {
      if (!client) return false;
      const { error } = await client.from('mf_quote_requests').insert({
        id: quote.id,
        name: quote.name,
        contact: quote.contact,
        project: quote.project,
        material: quote.material,
        measures: quote.measures,
        timeline: quote.timeline,
        details: quote.details,
        photo_names: quote.photos,
        created_at: quote.createdAt
      });
      if (error) throw authError(error);
      return { id: quote.id };
    },
    async loadQuoteRequests() {
      if (!client) return [];
      const user = await this.getUser();
      if (!user) return [];
      const { data, error } = await client.from('mf_quote_requests').select('*').order('created_at', { ascending: false }).limit(1000);
      if (error) throw authError(error);
      return (data || []).map((q) => ({ id: q.id, name: q.name, contact: q.contact, project: q.project, material: q.material, measures: q.measures, timeline: q.timeline, details: q.details, photos: q.photo_names || [], createdAt: q.created_at }));
    }
  };
})();
