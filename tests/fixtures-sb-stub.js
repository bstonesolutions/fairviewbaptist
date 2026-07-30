window.supabase = {
  createClient: function () {
    function chain(result) {
      var p = Promise.resolve(result);
      var o = {};
      ['select','order','limit','in','eq','neq','gte','lte','insert','update','upsert','delete','filter','like','single'].forEach(function (m) {
        o[m] = function () { return o; };
      });
      o.then = function (f, r) { return p.then(f, r); };
      o.catch = function (r) { return p.catch(r); };
      return o;
    }
    return {
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: { user: { email: 'brandonstone8567@gmail.com' }, access_token: 'stub-token' } } }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function(){} } } }; },
        signInWithPassword: function () { return Promise.resolve({ data: {}, error: null }); },
        signOut: function () { return Promise.resolve({}); }
      },
      from: function () { return chain({ data: [], error: null }); },
      storage: { from: function () { return { upload: function(){ return Promise.resolve({ data: {}, error: null }); }, getPublicUrl: function(){ return { data: { publicUrl: '' } }; } }; } }
    };
  }
};
